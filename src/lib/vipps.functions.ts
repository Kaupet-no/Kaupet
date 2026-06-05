import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyVerification = {
  provider: string;
  verified_name: string;
  verified_at: string;
  expires_at: string;
  is_valid: boolean;
} | null;

function vippsConfig() {
  const clientId = process.env.VIPPS_CLIENT_ID;
  const clientSecret = process.env.VIPPS_CLIENT_SECRET;
  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY;
  const env = (process.env.VIPPS_ENV ?? "test").toLowerCase();
  const redirectUri = process.env.VIPPS_REDIRECT_URI;
  const enabled = !!(clientId && clientSecret && subscriptionKey && redirectUri);
  const baseUrl =
    env === "prod" || env === "production"
      ? "https://api.vipps.no"
      : "https://apitest.vipps.no";
  return { clientId, clientSecret, subscriptionKey, redirectUri, baseUrl, enabled };
}

export const isVippsEnabled = createServerFn({ method: "GET" }).handler(async () => {
  return { enabled: vippsConfig().enabled };
});

export const startVippsVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = vippsConfig();
    if (!cfg.enabled) {
      throw new Error("Vipps-pålogging er ikke konfigurert ennå. Kontakt support.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const state = crypto.randomUUID() + "." + crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("vipps_oauth_states")
      .insert({ state, user_id: context.userId });
    if (error) throw new Error("Kunne ikke starte Vipps-pålogging: " + error.message);

    const params = new URLSearchParams({
      client_id: cfg.clientId!,
      response_type: "code",
      scope: "openid name phoneNumber",
      state,
      redirect_uri: cfg.redirectUri!,
    });
    const url = `${cfg.baseUrl}/access-management-1.0/access/oauth2/auth?${params.toString()}`;
    return { url };
  });

export const unverifyVipps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_verifications")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "vipps");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyVerification> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_verifications")
      .select("provider, verified_name, verified_at, expires_at")
      .eq("user_id", context.userId)
      .eq("provider", "vipps")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      provider: data.provider,
      verified_name: data.verified_name,
      verified_at: data.verified_at,
      expires_at: data.expires_at,
      is_valid: new Date(data.expires_at).getTime() > Date.now(),
    };
  });
