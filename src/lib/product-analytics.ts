import { isNative, nativePlatform } from "@/lib/native";
import {
  logProductEvent,
  type ProductEventName,
  type ProductEventProperties,
} from "@/lib/product-analytics.functions";

const SESSION_KEY = "kaupet-product-session";

export function getProductSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function getProductPlatform(): "web" | "ios" | "android" {
  if (!isNative()) return "web";
  const platform = nativePlatform();
  return platform === "web" ? "web" : platform;
}

/** Fire-and-forget by design: measurement must never delay or break UX. */
export function trackProductEvent(
  eventName: ProductEventName,
  properties: ProductEventProperties = {},
): void {
  if (typeof window === "undefined") return;
  const sessionId = getProductSessionId();
  if (!sessionId) return;
  void logProductEvent({
    data: {
      sessionId,
      eventName,
      platform: getProductPlatform(),
      path: window.location.pathname.slice(0, 160) || "/",
      properties,
    },
  }).catch(() => {
    // The migration may not be deployed yet or the client may be offline.
    // Telemetry is never a product dependency.
  });
}
