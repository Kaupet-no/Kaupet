/**
 * Felles wrapper for `/api/v1/…`-endepunktene (fase 4, del 2 — se
 * /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md):
 * autentiserer API-nøkkelen, sjekker scope, håndhever rategrensen for kallet,
 * setter `X-RateLimit-*`-headerne på svaret, og fanger alt annet enn kjente
 * feil til en generisk 500 uten å lekke stack/DB-detaljer.
 *
 * Ligger i `src/lib/` (ikke `src/features/`) fordi filen statisk importerer
 * andre `*.server.ts`-moduler (`api-keys.server.ts`, `api-rate-limit.server.ts`,
 * `api-response.server.ts`) — `scripts/check-server-boundary.mjs` forbyr
 * kun det fra `src/routes`/`src/components`/`src/features`.
 */
import {
  ApiAuthError,
  authenticateApiKey,
  type ApiKeyScope,
  type AuthenticatedApiKey,
} from "@/lib/api-keys.server";
import {
  apiRateLimitHeaders,
  consumeApiRateLimit,
  type ApiRateLimitKind,
} from "@/lib/api-rate-limit.server";
import {
  apiError,
  insufficientScope,
  internalError,
  tooManyRequests,
  type ApiErrorCode,
} from "@/lib/api-response.server";

export type ApiHandlerContext = {
  request: Request;
  params: Record<string, string>;
  auth: AuthenticatedApiKey;
};

/**
 * Forretningsfeil kastet fra `src/features/listing-api/listing-api.server.ts`
 * (`ListingApiError`) gjenkjennes strukturelt her i stedet for med
 * `instanceof` — å importere den klassen ville krevd et statisk import av en
 * `*.server.ts`-modul under `src/features` inn i en modul under `src/lib`,
 * som er greit i seg selv, men unødvendig kobler dette laget til ett
 * bestemt featuremodul. Et duck-typet objekt med disse feltene tolkes likt
 * uansett hvilken feature som kastet det.
 */
type BusinessError = {
  isApiBusinessError: true;
  status: number;
  code: string;
  message: string;
  field?: string;
};

function isBusinessError(error: unknown): error is BusinessError {
  // Krever en eksplisitt markør og en 4xx-status: andre feil med samme form
  // (f.eks. fra Supabase Storage) skal aldri få meldingen sin vist til kunden.
  const status = (error as { status?: unknown } | null)?.status;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isApiBusinessError?: unknown }).isApiBusinessError === true &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/**
 * `kind` styrer hvilken rategrense kallet telles mot (`read`/`write`/`batch`,
 * se api-rate-limit.server.ts), `scope` hvilket scope nøkkelen må ha.
 * `handler` gjør selve arbeidet og returnerer et ferdig `Response` (bruk
 * `apiJson`/`apiError`-hjelperne fra api-response.server.ts) — denne
 * funksjonen legger `X-RateLimit-*`-headerne til på det svaret uansett status.
 */
export function withApiHandler(
  kind: ApiRateLimitKind,
  scope: ApiKeyScope,
  handler: (ctx: ApiHandlerContext) => Promise<Response>,
) {
  return async (input: {
    request: Request;
    params?: Record<string, string>;
  }): Promise<Response> => {
    const { request, params } = input;
    try {
      const auth = await authenticateApiKey(request);

      const rateLimit = await consumeApiRateLimit(auth.keyId, kind);
      const rateLimitHeaders = apiRateLimitHeaders(rateLimit);

      if (!auth.scopes.includes(scope)) {
        const response = insufficientScope(`Denne API-nøkkelen mangler tilgangen «${scope}».`);
        for (const [key, value] of Object.entries(rateLimitHeaders))
          response.headers.set(key, value);
        return response;
      }
      if (!rateLimit.allowed) {
        return tooManyRequests(rateLimit);
      }

      const response = await handler({ request, params: params ?? {}, auth });
      for (const [key, value] of Object.entries(rateLimitHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return apiError(error.status, error.code as ApiErrorCode, error.message);
      }
      if (isBusinessError(error)) {
        return apiError(error.status, error.code as ApiErrorCode, error.message, {
          field: error.field,
        });
      }
      console.error("[api/v1] Uventet feil", error);
      return internalError();
    }
  };
}
