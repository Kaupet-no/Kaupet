/**
 * Generering og autentisering av Proff-organisasjoners API-nøkler (fase 4,
 * del 1 — se /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md).
 * REST-endepunktene som bruker `authenticateApiKey` kommer i en senere fase;
 * denne modulen er kun auth-/genereringslaget.
 */
import { sha256Hex } from "@/lib/request-ip.server";

/** Prefiks på hver klartekstnøkkel, slik at den er gjenkjennelig i logger og
 * i UI-en uten å avsløre resten av nøkkelen. */
export const API_KEY_PREFIX = "kpt_live_";

/** Antall tegn av klartekstnøkkelen (inkl. `API_KEY_PREFIX`) vist i UI-en og
 * lagret som `key_prefix`. Aldri nok til å gjette resten av nøkkelen. */
const DISPLAY_PREFIX_LENGTH = 12;

/** Antall tilfeldige bytes i selve nøkkelen (før base64url-koding). */
const KEY_RANDOM_BYTES = 32;

export type GeneratedApiKey = {
  /** Vises til kunden ÉN gang, rett etter opprettelse. Lagres aldri. */
  plaintext: string;
  /** `key_prefix`-kolonnen. */
  prefix: string;
  /** `key_hash`-kolonnen (sha-256, hex, 64 tegn). */
  hash: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Genererer en ny API-nøkkel med Web Crypto (edge-kompatibel — ingen
 * `node:crypto`), og dens sha-256-hash til lagring. */
export async function generateApiKey(): Promise<GeneratedApiKey> {
  const bytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const plaintext = `${API_KEY_PREFIX}${base64UrlEncode(bytes)}`;
  const hash = await sha256Hex(plaintext);
  return { plaintext, prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH), hash };
}

export type ApiKeyScope = "listings:read" | "listings:write";

export type AuthenticatedApiKey = {
  keyId: string;
  organizationId: string;
  actingUserId: string;
  defaultLocationId: string;
  scopes: ApiKeyScope[];
};

export type ApiAuthErrorCode =
  "missing_key" | "invalid_key" | "revoked" | "expired" | "inactive_member" | "no_proff";

/** Typet feil for `authenticateApiKey` — bærer HTTP-status og maskinlesbar
 * kode i tillegg til den norske teksten API-et sender i `error.message`
 * (se api-response.server.ts). */
export class ApiAuthError extends Error {
  readonly status: number;
  readonly code: ApiAuthErrorCode;
  constructor(status: number, code: ApiAuthErrorCode, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
    this.code = code;
  }
}

/** Årsakskoden `resolve_organization_api_key` returnerer ved avvisning, slått
 * opp til riktig HTTP-status/kode/norsk tekst. `unknown` (ingen nøkkel med
 * denne hashen) mappes til samme 401 som `invalid_key` — vi skiller aldri
 * "finnes ikke" fra "ugyldig" i responsen, det ville lekket informasjon. */
const REASON_TO_ERROR: Record<string, () => ApiAuthError> = {
  unknown: () => new ApiAuthError(401, "invalid_key", "Ugyldig API-nøkkel."),
  revoked: () => new ApiAuthError(401, "revoked", "Denne API-nøkkelen er tilbakekalt."),
  expired: () => new ApiAuthError(401, "expired", "Denne API-nøkkelen er utløpt."),
  inactive_member: () =>
    new ApiAuthError(
      403,
      "inactive_member",
      "Brukeren nøkkelen tilhører er ikke lenger et aktivt medlem av organisasjonen.",
    ),
  no_proff: () =>
    new ApiAuthError(403, "no_proff", "Organisasjonen har ikke lenger aktiv Proff-tilgang."),
};

/** Parser `Authorization: Bearer <nøkkel>`, slår opp og validerer nøkkelen
 * mot `resolve_organization_api_key`, og oppdaterer `last_used_at` (i RPC-en,
 * maks én gang per minutt). Kaster `ApiAuthError` ved alt annet enn en gyldig
 * nøkkel — ruteren mapper den til et JSON-feilsvar (se api-response.server.ts).
 *
 * Selve hash-oppslaget skjer som databaselikhet på en unik indeks (sha-256 av
 * nøkkelen), ikke en applikasjonsside strengsammenligning — det er derfor
 * ingen `timingSafeEqual`-sammenligning her: det er ingenting i denne
 * funksjonen som sammenligner to hemmeligheter tegn for tegn. */
export async function authenticateApiKey(request: Request): Promise<AuthenticatedApiKey> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ", 2);
  if (scheme !== "Bearer" || !token) {
    throw new ApiAuthError(401, "missing_key", "Mangler eller ugyldig API-nøkkel.");
  }

  const hash = await sha256Hex(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .rpc("resolve_organization_api_key", { _key_hash: hash })
    .single();
  if (error) throw error;

  if (data.reason !== "ok") {
    const toError = REASON_TO_ERROR[data.reason] ?? REASON_TO_ERROR.unknown;
    throw toError();
  }
  if (!data.key_id || !data.organization_id || !data.acting_user_id || !data.default_location_id) {
    throw new ApiAuthError(401, "invalid_key", "Ugyldig API-nøkkel.");
  }

  return {
    keyId: data.key_id,
    organizationId: data.organization_id,
    actingUserId: data.acting_user_id,
    defaultLocationId: data.default_location_id,
    scopes: (data.scopes ?? []) as ApiKeyScope[],
  };
}
