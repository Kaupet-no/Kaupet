/**
 * Felles JSON-svar-/feilformat for Proff-organisasjonenes REST-API (fase 4).
 * Selve endepunktene (`src/routes/api/v1/…`) kommer i en senere fase — denne
 * modulen er kun formatet, delt med `api-keys.server.ts`/`api-rate-limit.server.ts`
 * slik at alle tre er konsistente fra dag én.
 */
import { apiRateLimitHeaders, type ApiRateLimitResult } from "@/lib/api-rate-limit.server";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "internal_error"
  | "unsupported_media_type"
  | "insufficient_scope"
  // Fra `ApiAuthError` (api-keys.server.ts) — sendt uendret som `code` i
  // stedet for generalisert til `unauthorized`/`forbidden`, slik at Proff-
  // integrasjoner kan skille "mangler nøkkel" fra "utløpt" fra "tilbakekalt"
  // programmatisk (engelske, stabile koder — se docs/PROFF-API.md).
  | "missing_key"
  | "invalid_key"
  | "revoked"
  | "expired"
  | "inactive_member"
  | "no_proff";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Kun for `validation_error` — hvilket felt som feilet. */
    field?: string;
  };
};

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** Et vellykket svar. Bruk denne fremfor `Response.json` slik at alle
 * v1-endepunkter setter samme content-type konsekvent. */
export function apiJson(
  data: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  return jsonResponse(init?.status ?? 200, data, init?.headers);
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: { field?: string; headers?: HeadersInit },
): Response {
  const body: ApiErrorBody = {
    error: { code, message, ...(options?.field ? { field: options.field } : {}) },
  };
  return jsonResponse(status, body, options?.headers);
}

export function unauthorized(message = "Mangler eller ugyldig API-nøkkel."): Response {
  return apiError(401, "unauthorized", message);
}

export function forbidden(message = "Du har ikke tilgang til denne handlingen."): Response {
  return apiError(403, "forbidden", message);
}

export function notFound(message = "Fant ikke ressursen."): Response {
  return apiError(404, "not_found", message);
}

export function unprocessable(message: string, field?: string): Response {
  return apiError(422, "validation_error", message, { field });
}

/** 415 for opplastingsveier v1 ikke støtter ennå (multipart-bildeopplasting —
 * se `PUT /api/v1/listings/{externalRef}/images` i docs/PROFF-API.md). */
export function unsupportedMediaType(message: string): Response {
  return apiError(415, "unsupported_media_type", message);
}

/** 403 når nøkkelen mangler et scope kallet krever (gyldig nøkkel ellers). */
export function insufficientScope(message: string): Response {
  return apiError(403, "insufficient_scope", message);
}

/** 500 for interne feil. Lekker ALDRI stack/DB-detaljer — den norske
 * meldingen er alltid den samme; loggingen av det faktiske unntaket skjer
 * hos kalleren (se withApiHandler, src/lib/api-handler.server.ts). */
export function internalError(): Response {
  return apiError(500, "internal_error", "En intern feil oppstod på serveren. Prøv igjen senere.");
}

/** 429 med `Retry-After` og `X-RateLimit-*` satt fra samme grenseberegning
 * som slapp gjennom/avviste kallet — se api-rate-limit.server.ts. */
export function tooManyRequests(result: ApiRateLimitResult, message?: string): Response {
  return apiError(
    429,
    "rate_limited",
    message ?? "For mange forespørsler. Vent til grensen tilbakestilles og prøv igjen.",
    { headers: apiRateLimitHeaders(result) },
  );
}
