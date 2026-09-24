/**
 * Rategrenser for Proff-organisasjonenes API-nøkler (fase 4, del 1). Bygger
 * på `consume_rate_limit`/`peek_rate_limit`
 * (20260924140000_organization_api_keys.sql), som selv er en utvidelse av
 * `endpoint_rate_limits`/`check_endpoint_rate_limit`
 * (src/lib/rate-limit.server.ts) — samme tabell, men med gjenværende antall
 * og tilbakestillingstidspunkt i svaret, som REST-API-et (fase 4, del 2)
 * trenger til `X-RateLimit-*`/`Retry-After`-headerne.
 *
 * Grensene kommer fra `INTEGRATION_LIMITS.apiKey` (src/lib/integration-limits.ts)
 * — samme modul UI-en («Grenser og forbruk») leser tallene fra, slik at det
 * som håndheves og det som vises aldri kan avvike.
 */
import { INTEGRATION_LIMITS } from "@/lib/integration-limits";
import { sha256Hex } from "@/lib/request-ip.server";

export type ApiRateLimitKind = "read" | "write" | "batch";

const WINDOW_SECONDS = 3600;

const LIMIT_BY_KIND: Record<ApiRateLimitKind, number> = {
  read: INTEGRATION_LIMITS.apiKey.readPerHour,
  write: INTEGRATION_LIMITS.apiKey.writePerHour,
  batch: INTEGRATION_LIMITS.apiKey.batchPerHour,
};

export type ApiRateLimitResult = {
  allowed: boolean;
  kind: ApiRateLimitKind;
  limit: number;
  /** Aldri negativ — 0 når grensen er nådd eller oversteget. */
  remaining: number;
  resetAt: Date;
  /** Kun ment å brukes når `allowed` er `false` (`Retry-After`-header). */
  retryAfterSeconds: number;
};

/** `consume_rate_limit`/`peek_rate_limit` krever en 64-tegns hex-nøkkel
 * (samme kolonne som IP-/bruker-bucketene i endpoint_rate_limits) — her
 * hashes API-nøkkelens `id` sammen med grensetypen, slik at lesing,
 * skriving og batch telles i hver sin bucket for samme nøkkel. */
function bucketKeyHash(keyId: string, kind: ApiRateLimitKind): Promise<string> {
  return sha256Hex(`${keyId}:${kind}`);
}

function toResult(
  kind: ApiRateLimitKind,
  row: { allowed?: boolean; count: number; limit: number; reset_at: string },
): ApiRateLimitResult {
  const resetAt = new Date(row.reset_at);
  const remaining = Math.max(0, row.limit - row.count);
  return {
    allowed: row.allowed ?? remaining > 0,
    kind,
    limit: row.limit,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

/** Teller opp ett kall av typen `kind` for API-nøkkelen `keyId` og returnerer
 * om det var innenfor grensen. Kall dette ÉN gang per innkommende request. */
export async function consumeApiRateLimit(
  keyId: string,
  kind: ApiRateLimitKind,
): Promise<ApiRateLimitResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = LIMIT_BY_KIND[kind];
  const keyHash = await bucketKeyHash(keyId, kind);
  const { data, error } = await supabaseAdmin
    .rpc("consume_rate_limit", {
      _bucket: `api-key:${kind}`,
      _key_hash: keyHash,
      _limit: limit,
      _window_seconds: WINDOW_SECONDS,
    })
    .single();
  if (error) throw error;
  return toResult(kind, data);
}

/** Samme beregning uten å telle opp — til «Grenser og forbruk»-visningen, som
 * ellers ville brukt av kundens egen rategrense hver gang bedriftskonsollet
 * åpnes. */
export async function peekApiRateLimit(
  keyId: string,
  kind: ApiRateLimitKind,
): Promise<ApiRateLimitResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = LIMIT_BY_KIND[kind];
  const keyHash = await bucketKeyHash(keyId, kind);
  const { data, error } = await supabaseAdmin
    .rpc("peek_rate_limit", {
      _bucket: `api-key:${kind}`,
      _key_hash: keyHash,
      _limit: limit,
      _window_seconds: WINDOW_SECONDS,
    })
    .single();
  if (error) throw error;
  return toResult(kind, { ...data, allowed: data.count < limit });
}

/** `X-RateLimit-Limit`/`-Remaining`/`-Reset` (alle svar) og `Retry-After`
 * (kun ved 429) — se api-response.server.ts sin `tooManyRequests`-helper. */
export function apiRateLimitHeaders(result: ApiRateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }
  return headers;
}
