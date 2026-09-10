import { createFileRoute } from "@tanstack/react-router";

/**
 * Vipps webhook handler — receives payment state changes.
 * Configure the webhook subscription in Vipps with this URL and the
 * VIPPS_WEBHOOK_SECRET as the shared secret.
 *
 * https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/
 */
export const Route = createFileRoute("/api/public/vipps/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const host = request.headers.get("host");

        const { getVippsWebhookSecret, getVippsPayment, verifyVippsWebhookSignature } =
          await import("@/lib/vipps.server");
        const secret = await getVippsWebhookSecret(host);
        // Fail closed: an endpoint with no configured secret must not accept
        // unverified requests, since that would let anyone trigger processing
        // of arbitrary payment references.
        if (!secret) {
          console.error("[vipps webhook] no webhook secret configured, rejecting request");
          return new Response("Webhook not configured", { status: 401 });
        }
        const sigHeader =
          request.headers.get("x-ms-signature") ?? request.headers.get("authorization") ?? "";
        if (!verifyVippsWebhookSignature(secret, sigHeader, raw)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const reference = typeof payload?.reference === "string" ? payload.reference : undefined;
        const eventName =
          typeof payload?.name === "string"
            ? payload.name
            : typeof payload?.eventName === "string"
              ? payload.eventName
              : undefined;
        const eventIdRaw = payload?.eventId ?? payload?.id;
        const eventId: string =
          typeof eventIdRaw === "string"
            ? eventIdRaw
            : `${reference ?? "noref"}-${eventName ?? "evt"}-${Date.now()}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency
        const { data: existing } = await supabaseAdmin
          .from("vipps_webhook_events")
          .select("id, processed_at")
          .eq("event_id", eventId)
          .maybeSingle();
        if (existing?.processed_at) {
          return new Response("ok", { status: 200 });
        }
        if (!existing) {
          await supabaseAdmin.from("vipps_webhook_events").insert({
            event_id: eventId,
            reference: reference ?? null,
            event_name: eventName ?? null,
            payload: payload as never,
          });
        }

        if (!reference) {
          await supabaseAdmin
            .from("vipps_webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("event_id", eventId);
          return new Response("ok");
        }

        // Look up promotion
        const { data: promo } = await supabaseAdmin
          .from("listing_promotions")
          .select("id, status, duration_days, price_nok, vipps_mode")
          .eq("vipps_reference", reference)
          .maybeSingle();

        if (!promo) {
          await supabaseAdmin
            .from("vipps_webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("event_id", eventId);
          return new Response("ok");
        }

        // Re-fetch authoritative state from Vipps, using the environment the
        // transaction was created in — not the request's host.
        const promoMode = promo.vipps_mode as "test" | "production";
        let payment;
        try {
          payment = await getVippsPayment(reference, host, promoMode);
        } catch (err) {
          console.error("[vipps webhook] state fetch failed", err);
          return new Response("Retry later", { status: 503 });
        }

        if (payment.state === "AUTHORIZED" || payment.state === "CAPTURED") {
          if (promo.status === "pending") {
            if (payment.state === "AUTHORIZED") {
              try {
                const { captureVippsPayment } = await import("@/lib/vipps.server");
                await captureVippsPayment(
                  reference,
                  promo.price_nok,
                  `capture-${promo.id}`,
                  host,
                  promoMode,
                );
              } catch (err) {
                console.error("[vipps webhook] capture failed", err);
                // Keep the promotion pending and the event unprocessed. Vipps
                // or the reconciliation job can safely retry the idempotent
                // capture instead of granting an unpaid promotion.
                return new Response("Retry later", { status: 503 });
              }
            }

            const now = new Date();
            const expires = new Date(now.getTime() + promo.duration_days * 24 * 60 * 60 * 1000);
            const { error: activateError } = await supabaseAdmin
              .from("listing_promotions")
              .update({
                status: "active",
                starts_at: now.toISOString(),
                expires_at: expires.toISOString(),
                vipps_psp_reference: payment.pspReference ?? null,
              })
              .eq("id", promo.id)
              .eq("status", "pending");
            if (activateError) throw activateError;
          }
        } else if (
          payment.state === "CANCELLED" ||
          payment.state === "EXPIRED" ||
          payment.state === "TERMINATED" ||
          payment.state === "ABORTED" ||
          payment.state === "FAILED"
        ) {
          if (promo.status === "pending") {
            const { error: failError } = await supabaseAdmin
              .from("listing_promotions")
              .update({ status: "failed" })
              .eq("id", promo.id)
              .eq("status", "pending");
            if (failError) throw failError;
          }
        } else if (payment.state === "REFUNDED") {
          const { error: refundError } = await supabaseAdmin
            .from("listing_promotions")
            .update({ status: "refunded" })
            .eq("id", promo.id);
          if (refundError) throw refundError;
        } else {
          return new Response("Retry later", { status: 503 });
        }

        await supabaseAdmin
          .from("vipps_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("event_id", eventId);

        return new Response("ok", { status: 200 });
      },
    },
  },
});
