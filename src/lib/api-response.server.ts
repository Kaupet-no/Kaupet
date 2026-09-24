/**
 * Felles JSON-svar-/feilformat for Proff-organisasjonenes REST-API (fase 4).
 * Selve endepunktene (`src/routes/api/v1/…`) kommer i en senere fase — denne
 * modulen er kun formatet, delt med `api-keys.server.ts`/`api-rate-limit.server.ts`
 * slik at alle tre er konsistente fra dag én.
 */
import { apiRateLimitHeaders, type ApiRateLimitResult } from "@/lib/api-rate-limit.server";

export type ApiErrorCode =
  "unauthorized" | "forbidden" | "not_found" | "validation_error" | "rate_limited";

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
