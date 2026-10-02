const EXACT_PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);

function isProviderHost(hostname: string): boolean {
  return (
    EXACT_PUSH_HOSTS.has(hostname) ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.push\.apple\.com$/.test(hostname) ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.notify\.windows\.com$/.test(hostname)
  );
}

export function isSupportedWebPushEndpoint(value: string): boolean {
  if (
    value !== value.trim() ||
    [...value].some(
      (char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.port === "" || url.port === "443") &&
      !url.username &&
      !url.password &&
      !url.hash &&
      isProviderHost(url.hostname)
    );
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string, length: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = atob(
      value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4),
    );
    if (decoded.length !== length) return null;
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

export async function isValidWebPushKeys(p256dh: string, auth: string): Promise<boolean> {
  const publicKey = decodeBase64Url(p256dh, 65);
  if (!publicKey || publicKey[0] !== 4 || !decodeBase64Url(auth, 16)) return false;
  try {
    const rawKey = new Uint8Array(65);
    rawKey.set(publicKey);
    await crypto.subtle.importKey(
      "raw",
      rawKey.buffer,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return true;
  } catch {
    return false;
  }
}

export async function isValidWebPushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<boolean> {
  return (
    isSupportedWebPushEndpoint(subscription.endpoint) &&
    (await isValidWebPushKeys(subscription.p256dh, subscription.auth))
  );
}
