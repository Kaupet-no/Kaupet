import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { createFileRoute } from "@tanstack/react-router";
import { describeSafeError } from "@/lib/safe-error";
import { logServerError } from "@/lib/server-error-log";

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

        const {
          getVippsWebhookSecret,
          getVippsPayment,
          vippsPaymentStatus,
          getVippsWebhookEventId,
          isFreshVippsWebhookDate,
          getVippsWebhookRejectionReason,
        } = await import("@/lib/vipps.server");
        const secret = await getVippsWebhookSecret(host);
        // Fail closed: an endpoint with no configured secret must not accept
        // unverified requests, since that would let anyone trigger processing
        // of arbitrary payment references.
        if (!secret) {
          console.error("[vipps webhook] no webhook secret configured, rejecting request");
          return new Response("Webhook not configured", { status: 401 });
        }
        const url = new URL(request.url);
        const date = request.headers.get("x-ms-date") ?? "";
        const contentHash = request.headers.get("x-ms-content-sha256") ?? "";
        const authorization = request.headers.get("authorization") ?? "";
        const pathAndQuery = `${url.pathname}${url.search}`;
        const rejectionReason = host
          ? getVippsWebhookRejectionReason(secret, {
              method: request.method,
              pathAndQuery,
              host,
              date,
              contentHash,
              authorization,
              rawBody: raw,
            })
          : null;
        if (!host || rejectionReason) {
          console.warn("[vipps webhook] signature rejected", {
            reason: rejectionReason ?? "missing_host",
            method: request.method,
            hasDateHeader: date !== "",
            hasContentHashHeader: contentHash !== "",
            authorizationScheme: authorization.startsWith("HMAC-SHA256 ") ? "HMAC-SHA256" : "other",
          });
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
        const eventId = getVippsWebhookEventId(payload);
        if (!eventId) {
          return new Response("Missing webhook event identity", { status: 400 });
        }

        const supabaseAdmin = await getSupabaseAdmin();

        // Idempotency
        const { data: existing } = await supabaseAdmin
          .from("vipps_webhook_events")
          .select("id, processed_at")
          .eq("event_id", eventId)
          .maybeSingle();
        if (existing?.processed_at) {
          return new Response("ok", { status: 200 });
        }
        // The request date is covered by the HMAC. Check it only for a new
        // event so a known Vipps retry remains idempotent even after the
        // freshness window.
        if (!existing && !isFreshVippsWebhookDate(date)) {
          console.warn("[vipps webhook] stale webhook");
          return new Response("Stale webhook", { status: 401 });
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
          .select("id, listing_id, status, duration_days, price_nok, vipps_mode")
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
          console.error("[vipps webhook] state fetch failed", describeSafeError(err));
          return new Response("Retry later", { status: 503 });
        }
        const status = vippsPaymentStatus(payment);

        // Gir kunden pengene tilbake for en betalt fremheving som ikke kan
        // aktiveres. false = feilet (logget); kalleren svarer 503 så Vipps prøver igjen.
        const releasePayment = async (captured: boolean) => {
          try {
            const { releaseSupersededPromotionPayment } = await import("@/lib/vipps.server");
            await releaseSupersededPromotionPayment({
              promotionId: promo.id,
              reference,
              amountNok: promo.price_nok,
              captured,
              host,
              mode: promoMode,
            });
            return true;
          } catch (err) {
            await logServerError("vippsWebhook.releaseSupersededPayment", err, {
              promotion_id: promo.id,
            });
            return false;
          }
        };

        if (status === "AUTHORIZED" || status === "CAPTURED") {
          // `failed` kan være satt av reconcile før Vipps rapporterte betaling.
          // Har annonsen fått en ny fremheving i mellomtiden, kan denne ikke
          // aktiveres (uniq_active_promotion_per_listing): ikke aktiver, og gi
          // pengene tilbake (refusjon/kansellering) i stedet for å feile i retry-løkke.
          let superseded = false;
          if (promo.status === "failed") {
            const { data: live, error: liveError } = await supabaseAdmin
              .from("listing_promotions")
              .select("id")
              .eq("listing_id", promo.listing_id)
              .in("status", ["active", "pending", "gifted"])
              .neq("id", promo.id)
              .limit(1);
            if (liveError) throw liveError;
            superseded = (live?.length ?? 0) > 0;
          }
          if (superseded) {
            await logServerError(
              "vippsWebhook.paidSupersededPromotion",
              new Error(`Betalt fremheving kan ikke aktiveres (${status})`),
              { promotion_id: promo.id },
            );
            if (!(await releasePayment(status === "CAPTURED"))) {
              return new Response("Retry later", { status: 503 });
            }
          } else if (promo.status === "pending" || promo.status === "failed") {
            if (status === "AUTHORIZED") {
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
                console.error("[vipps webhook] capture failed", describeSafeError(err));
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
              .in("status", ["pending", "failed"]);
            if (activateError?.code === "23505") {
              // Kappløp med en ny fremheving på samme annonse etter sjekken over.
              await logServerError("vippsWebhook.paidSupersededPromotion", activateError, {
                promotion_id: promo.id,
              });
              // AUTHORIZED ble capturet like over, så betalingen er belastet.
              if (!(await releasePayment(true))) {
                return new Response("Retry later", { status: 503 });
              }
            } else if (activateError) throw activateError;
          }
        } else if (
          status === "CANCELLED" ||
          status === "EXPIRED" ||
          status === "TERMINATED" ||
          status === "ABORTED"
        ) {
          if (promo.status === "pending") {
            const { error: failError } = await supabaseAdmin
              .from("listing_promotions")
              .update({ status: "failed" })
              .eq("id", promo.id)
              .eq("status", "pending");
            if (failError) throw failError;
          }
        } else if (status === "REFUNDED") {
          // Også refusjon gjort i Vipps-portalen. Allerede refunderte rader
          // beholder sin opprinnelige refunded_at.
          const { error: refundError } = await supabaseAdmin
            .from("listing_promotions")
            .update({ status: "refunded", refunded_at: new Date().toISOString() })
            .eq("id", promo.id)
            .neq("status", "refunded");
          if (refundError) throw refundError;
        } else if (status !== "CREATED" && status !== "PARTIALLY_REFUNDED") {
          // Ukjent tilstand fra Vipps: prøv igjen. CREATED (ikke betalt ennå)
          // og PARTIALLY_REFUNDED (delvis refusjon beholder fremhevingen)
          // markeres behandlet uten endring.
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
