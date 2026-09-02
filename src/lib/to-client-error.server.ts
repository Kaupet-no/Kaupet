import { logServerError } from "@/lib/server-error-log";

const GENERIC_MESSAGE = "Noe gikk galt. Prøv igjen senere.";

/** Postgres error codes with a safe, generic Norwegian message the client
 * may see as-is. Anything not on this list is logged and replaced with
 * GENERIC_MESSAGE — a raw PostgREST error otherwise leaks constraint names,
 * column names and internal error codes to the client. */
const SAFE_CODE_MESSAGES: Record<string, string> = {
  "23505": "Finnes allerede.",
  "23503": "Kan ikke fullføre — noe denne er knyttet til finnes ikke lenger.",
};

/** Logs the real error via logServerError and returns an Error safe to
 * re-throw from a server function handler. Use in place of `throw error`
 * for raw Postgres/PostgREST errors. See docs/SIKKERHETSVURDERING.md L-14. */
export async function toClientError(
  functionName: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<Error> {
  await logServerError(functionName, error, context);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new Error((code && SAFE_CODE_MESSAGES[code]) || GENERIC_MESSAGE);
}
