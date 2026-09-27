import { createIsomorphicFn } from "@tanstack/react-start";

const SAFE_CODE_MESSAGES: Record<string, string> = {
  "23505": "Finnes allerede.",
  "23503": "Kan ikke fullføre — noe denne er knyttet til finnes ikke lenger.",
};

function sanitizeClientError(error: unknown): Error {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new Error((code && SAFE_CODE_MESSAGES[code]) || "Noe gikk galt. Prøv igjen senere.");
}

/** En forventet brukerfeil (f.eks. rate-limit, manglende tilgang). Kastes fra
 * serverfunksjoner når meldingen er trygg å vise og feilen ikke er serverens:
 * `serverFnErrorLogMiddleware` i start.ts svarer da med `status` i stedet for
 * 500 og logger den som en advarsel. */
export class ClientError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// Feil toClientError allerede har logget med den opprinnelige årsaken, slik at
// serverfunksjons-middlewaren ikke logger den rensede kopien én gang til.
const loggedErrors = new WeakSet<object>();

export function isAlreadyLogged(error: unknown): boolean {
  return typeof error === "object" && error !== null && loggedErrors.has(error);
}

/** Logs server errors and returns a safe error in both environments. */
export const toClientError = createIsomorphicFn()
  .server(async (functionName: string, error: unknown, context?: Record<string, unknown>) => {
    const { logServerError } = await import("@/lib/server-error-log");
    await logServerError(functionName, error, context);
    const clientError = sanitizeClientError(error);
    loggedErrors.add(clientError);
    return clientError;
  })
  .client((_functionName: string, error: unknown) => sanitizeClientError(error));
