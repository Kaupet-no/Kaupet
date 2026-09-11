const TURNSTILE_ERROR = "Turnstile-validering feilet. Prøv igjen.";
const CONFIG_ERROR = "Serverfeil: bot-beskyttelse er ikke konfigurert.";

/** Verifies a Turnstile token without exposing the secret to client bundles. */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  expectedAction = "kaupet",
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Local development has no secret by design. Deployed environments fail closed.
    if (process.env.NODE_ENV === "production") throw new Error(CONFIG_ERROR);
    return;
  }
  if (!token || token.length > 2048) throw new Error(TURNSTILE_ERROR);

  const allowedHostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHostnames.length === 0) throw new Error(CONFIG_ERROR);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    });
    if (!response.ok) throw new Error(TURNSTILE_ERROR);
    const result = (await response.json()) as {
      success?: unknown;
      action?: unknown;
      hostname?: unknown;
    };
    // Cloudflare's documented testing sitekey/secret pair (used by E2E) always
    // verifies with hostname "example.com" and no action, so the action/
    // hostname allowlist check below can never pass against it — skip just
    // that part in E2E, success/token validity is still exercised for real.
    const isE2E = process.env.E2E_TEST === "1";
    if (
      result.success !== true ||
      (!isE2E &&
        (result.action !== expectedAction ||
          typeof result.hostname !== "string" ||
          !allowedHostnames.includes(result.hostname.toLowerCase())))
    ) {
      throw new Error(TURNSTILE_ERROR);
    }
  } catch (error) {
    if (error instanceof Error && error.message === TURNSTILE_ERROR) throw error;
    throw new Error(TURNSTILE_ERROR, { cause: error });
  }
}
