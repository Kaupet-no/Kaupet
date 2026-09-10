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

/** Logs server errors and returns a safe error in both environments. */
export const toClientError = createIsomorphicFn()
  .server(async (functionName: string, error: unknown, context?: Record<string, unknown>) => {
    const { logServerError } = await import("@/lib/server-error-log");
    await logServerError(functionName, error, context);
    return sanitizeClientError(error);
  })
  .client((_functionName: string, error: unknown) => sanitizeClientError(error));
