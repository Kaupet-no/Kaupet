import { createFileRoute } from "@tanstack/react-router";

function siteOrigin(request: Request) {
  return new URL(request.url).origin;
}

function redirect(origin: string, params: Record<string, string>) {
  const url = new URL("/profil", origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

export const Route = createFileRoute("/api/public/auth/vipps/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = siteOrigin(request);
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");

        if (errParam) return redirect(origin, { vipps: "error", reason: errParam });
        if (!code || !state) return redirect(origin, { vipps: "error", reason: "missing_params" });

        const clientId = process.env.VIPPS_CLIENT_ID;
        const clientSecret = process.env.VIPPS_CLIENT_SECRET;
        const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY;
        const env = (process.env.VIPPS_ENV ?? "test").toLowerCase();
        const redirectUri = process.env.VIPPS_REDIRECT_URI;
        if (!clientId || !clientSecret || !subscriptionKey || !redirectUri) {
          return redirect(origin, { vipps: "error", reason: "not_configured" });
        }
        const baseUrl =
          env === "prod" || env === "production"
            ? "https://api.vipps.no"
            : "https://apitest.vipps.no";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Validate + consume state
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("vipps_oauth_states")
          .select("user_id, expires_at")
          .eq("state", state)
          .maybeSingle();
        if (stateErr || !stateRow) {
          return redirect(origin, { vipps: "error", reason: "invalid_state" });
        }
        await supabaseAdmin.from("vipps_oauth_states").delete().eq("state", state);
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          return redirect(origin, { vipps: "error", reason: "state_expired" });
        }
        const userId = stateRow.user_id as string;

        // Exchange code for tokens
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenRes = await fetch(
          `${baseUrl}/access-management-1.0/access/oauth2/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${basic}`,
              "Ocp-Apim-Subscription-Key": subscriptionKey,
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
            }).toString(),
          },
        );
        if (!tokenRes.ok) {
          return redirect(origin, { vipps: "error", reason: "token_exchange_failed" });
        }
        const tokenJson = (await tokenRes.json()) as { access_token?: string };
        if (!tokenJson.access_token) {
          return redirect(origin, { vipps: "error", reason: "no_access_token" });
        }

        // Fetch userinfo
        const userinfoRes = await fetch(`${baseUrl}/vipps-userinfo-api/userinfo`, {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            "Ocp-Apim-Subscription-Key": subscriptionKey,
          },
        });
        if (!userinfoRes.ok) {
          return redirect(origin, { vipps: "error", reason: "userinfo_failed" });
        }
        const info = (await userinfoRes.json()) as {
          sub?: string;
          name?: string;
          phone_number?: string;
        };
        if (!info.sub || !info.name) {
          return redirect(origin, { vipps: "error", reason: "userinfo_incomplete" });
        }

        const verifiedName = info.name.trim().slice(0, 200);
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertErr } = await supabaseAdmin
          .from("user_verifications")
          .upsert({
            user_id: userId,
            provider: "vipps",
            verified_name: verifiedName,
            subject: info.sub,
            phone_e164: info.phone_number ?? null,
            verified_at: new Date().toISOString(),
            expires_at: expiresAt,
          });
        if (upsertErr) {
          return redirect(origin, { vipps: "error", reason: "save_failed" });
        }

        // Lock display name to verified name
        await supabaseAdmin
          .from("profiles")
          .update({ display_name: verifiedName })
          .eq("id", userId);

        return redirect(origin, { vipps: "ok" });
      },
    },
  },
});
