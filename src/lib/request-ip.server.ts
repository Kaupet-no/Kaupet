import { getRequest } from "@tanstack/react-start/server";

/** SHA-256 hex digest for non-IP rate-limit bucket keys. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Returns a keyed request-IP fingerprint. The raw address is never persisted. */
export async function hashRequestIp(): Promise<string> {
  const request = getRequest();
  const ip =
    request?.headers.get("cf-connecting-ip") ??
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown";
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Rate-limit fingerprint is not configured");
    }
    return sha256Hex(ip);
  }
  return hmacSha256Hex(secret, ip);
}
