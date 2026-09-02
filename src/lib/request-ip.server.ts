import { getRequest } from "@tanstack/react-start/server";

/** SHA-256 hex digest, for non-reversible rate-limit bucket keys. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Returns a non-reversible request-IP fingerprint suitable for short-lived
 * abuse-control buckets. The raw address is never persisted. */
export async function hashRequestIp(): Promise<string> {
  const request = getRequest();
  const ip =
    request?.headers.get("cf-connecting-ip") ??
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown";
  return sha256Hex(ip);
}
