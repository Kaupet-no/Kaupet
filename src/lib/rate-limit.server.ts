import { hashRequestIp } from "@/lib/request-ip.server";

/** Throws if the calling IP has exceeded `limit` calls to `bucket` within
 * `windowSeconds`. Backed by check_endpoint_rate_limit — see
 * docs/SIKKERHETSVURDERING.md M-9. */
export async function assertNotRateLimited(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keyHash = await hashRequestIp();
  const { data: allowed, error } = await supabaseAdmin.rpc("check_endpoint_rate_limit", {
    _bucket: bucket,
    _key_hash: keyHash,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) throw error;
  if (!allowed) throw new Error("For mange forespørsler. Prøv igjen senere.");
}
