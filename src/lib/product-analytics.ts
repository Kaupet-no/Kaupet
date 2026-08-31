import { isNative, nativePlatform } from "@/lib/native";
import {
  logProductEvent,
  type ProductEventName,
  type ProductEventProperties,
} from "@/lib/product-analytics.functions";

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
  try {
    void logProductEvent({
      data: {
        eventName,
        platform: getProductPlatform(),
        path: window.location.pathname.slice(0, 160) || "/",
        properties,
      },
    }).catch(() => {
      // Telemetry is never a product dependency.
    });
  } catch {
    // A client/server bridge can fail synchronously (for example in a
    // browser-based native emulation). Telemetry must never break the action.
  }
}
