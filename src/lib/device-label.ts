// Formats a human-readable device label for a push_subscriptions row.
// `ua` is the stored `user_agent` string (captured once at subscribe time,
// see push.ts), never the viewer's own live navigator.

export function parseUserAgent(ua: string | null, platform: string): string {
  if (platform === "android") return "Android-appen";
  // Native iOS push-abonnement lagrer ikke user_agent (kun fcm_token, se
  // native-push.ts) — vi vet ikke om det er iPhone eller iPad, så vi sier
  // det ikke er en nettleser.
  if (platform === "ios" && !ua) return "Kaupet-appen (iOS)";
  if (!ua) return "Ukjent nettleser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Nettleser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Macintosh/.test(ua)
      ? "Mac"
      : /Linux/.test(ua)
        ? "Linux"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : null;
  return os ? `${browser} på ${os}` : browser;
}
