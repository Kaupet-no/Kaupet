// Client-side Web Push helpers.
// Service worker registration is restricted to production (not Lovable preview/iframe).

import { savePushSubscription, deletePushSubscription } from "./push.functions";

// Public VAPID key — safe to expose to the browser.
export const VAPID_PUBLIC_KEY =
  "BMRQX3t2gjuYxtGw6f9TNJdz41nQWWd4zyPSBYNAaMNiYsRi73VVBpU6wb0xJ2m1R7MT7De-HQxl-hWbTy5fJbA";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function isAllowedEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (window.self !== window.top) return false; // no iframe / Lovable preview
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return false;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return false;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return false;
  return true;
}

export function pushSupported(): boolean {
  return (
    isAllowedEnvironment() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribe(): Promise<void> {
  if (!pushSupported()) throw new Error("Push-varsler støttes ikke i denne nettleseren");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Tillatelse til varslinger ble ikke gitt");
  }

  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }


  const json = subscription.toJSON();
  await savePushSubscription({
    data: {
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent.slice(0, 255),
    },
  });
}

export async function unsubscribeThisDevice(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deletePushSubscription({ data: { endpoint } });
}

export async function getCurrentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return null;
  const sub = await registration.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
