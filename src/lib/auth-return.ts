const MAX_RETURN_TO_LENGTH = 500;
const RETURN_TO_ORIGIN = "https://kaupet.invalid";

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Only allow an internal absolute path. This prevents auth links from being
 * turned into open redirects while preserving route search/hash state. */
export function safeReturnTo(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > MAX_RETURN_TO_LENGTH ||
    containsControlCharacter(value) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return undefined;
  }
  try {
    // WHATWG URL treats a backslash after the leading slash as a network-path
    // separator, so the origin check closes that variant too.
    if (new URL(value, RETURN_TO_ORIGIN).origin !== RETURN_TO_ORIGIN) return undefined;
  } catch {
    return undefined;
  }
  return value;
}

export function postAuthDestination(
  returnTo: string | undefined,
  hasBusinessAccount: boolean,
): string {
  return returnTo ?? (hasBusinessAccount ? "/bedrift" : "/");
}

/** Builds the same internal callback for signup and confirmation resend. */
export function authConfirmationRedirect(returnTo: string | undefined, origin: string): string {
  const safeTarget = safeReturnTo(returnTo) ?? "/";
  return `${origin}/auth?mode=signin&returnTo=${encodeURIComponent(safeTarget)}`;
}

export function authResumeReturnTo(returnTo: string | undefined): string {
  const safeTarget = safeReturnTo(returnTo) ?? "/";
  const target = new URL(safeTarget, RETURN_TO_ORIGIN);
  target.searchParams.set("resume", "auth-publish");
  return `${target.pathname}${target.search}${target.hash}`;
}

export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
