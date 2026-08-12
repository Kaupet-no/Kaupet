const MAX_RETURN_TO_LENGTH = 500;

/** Only allow an internal absolute path. This prevents auth links from being
 * turned into open redirects while preserving route search/hash state. */
export function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_RETURN_TO_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
