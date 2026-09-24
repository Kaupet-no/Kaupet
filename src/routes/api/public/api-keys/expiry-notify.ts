import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Kalles av notify_expiring_organization_api_keys() (pg_cron, daglig, via
// pg_net) — se supabase/migrations/20260924140000_organization_api_keys.sql.
// Samme delte hemmelighet-mønster som /api/public/push/dispatch,
// /api/public/images/process og /api/public/r2/cleanup: kun en id (og her en
// fast terskel-verdi) sendes i payloaden, alt annet re-utledes fra
// databasen, slik at et lekket secret ikke kan brukes til å sende vilkårlig
// e-postinnhold.
function isAuthorized(request: Request): boolean {
  const expected = process.env.API_KEY_EXPIRY_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-api-key-expiry-secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

const PayloadSchema = z.object({
  api_key_id: z.string().uuid(),
  threshold_days: z.union([z.literal(14), z.literal(3)]),
});

export const Route = createFileRoute("/api/public/api-keys/expiry-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        let payload: z.infer<typeof PayloadSchema>;
        try {
          payload = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        // Dynamisk import: en statisk import av en .server-modul i
        // src/routes drar den inn i klientgrafen (se
        // scripts/check-server-boundary.mjs).
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: key } = await supabaseAdmin
          .from("organization_api_keys")
          .select("id, name, organization_id, expires_at, revoked_at")
          .eq("id", payload.api_key_id)
          .maybeSingle();
        // Nøkkelen kan ha blitt tilbakekalt/slettet mellom cron-jobben og
        // dette kallet — hopp da bare over, uten feil (jobben har allerede
        // markert expiry_notified_*_at, se migrasjonen).
        if (!key || key.revoked_at) {
          return new Response(null, { status: 204 });
        }

        const { data: superusers } = await supabaseAdmin
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", key.organization_id)
          .eq("role", "superuser")
          .eq("status", "active");
        if (!superusers || superusers.length === 0) {
          return new Response(null, { status: 204 });
        }

        const expiresAt = new Date(key.expires_at);
        const dateLabel = expiresAt.toLocaleDateString("nb-NO");
        const subject = `API-nøkkelen «${key.name}» utløper om ${payload.threshold_days} dager`;
        const body =
          `API-nøkkelen «${key.name}» utløper ${dateLabel}. ` +
          "Opprett en ny nøkkel i god tid og bytt den ut i integrasjonen, slik at synken ikke stopper.";
        const url = "/bedrift?tab=integrasjoner";

        const { sendNotificationEmail } = await import("@/lib/email.server");
        for (const member of superusers) {
          const { data: user } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
          const to = user?.user?.email;
          if (!to) continue;
          try {
            await sendNotificationEmail({ to, type: "api_key_expiring", subject, body, url });
          } catch (err) {
            console.error("API key expiry email dispatch error", err);
          }
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
