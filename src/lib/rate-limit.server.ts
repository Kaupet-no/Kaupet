import { toClientError } from "@/lib/to-client-error";
import { hashRequestIp } from "@/lib/request-ip.server";

/** Throws if the calling IP has exceeded `limit` calls to `bucket` within
 * `windowSeconds`. Backed by check_endpoint_rate_limit — see
 * the internal security review, M-9. */
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
  if (error) {
    throw await toClientError("database", error);
  }
  if (!allowed) throw new Error("For mange forespørsler. Prøv igjen senere.");
}

/** Same database-backed limiter, keyed by the authenticated user rather than
 * the request IP. Use this for authenticated writes. */
export async function assertUserNotRateLimited(
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: allowed, error } = await supabaseAdmin.rpc("check_user_rate_limit", {
    _bucket: bucket,
    _user_id: userId,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    throw await toClientError("database", error);
  }
  if (!allowed) throw new Error("For mange forespørsler. Prøv igjen senere.");
}
