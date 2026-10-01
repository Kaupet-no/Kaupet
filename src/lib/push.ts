// Client-side Web Push helpers.
// Service worker registration is restricted to top-level documents — push
// subscriptions are unreliable (and often blocked outright) inside an iframe.

import { savePushSubscription, deletePushSubscription } from "./push.functions";

// Public VAPID key — safe to expose to the browser.
// Rotated because the old private key wasn't retrievable.
// All push subscriptions created against the previous key stop working once
// this ships to production — existing subscribers must re-enable push.
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BPFo1ygL7dxhxhtTCPbE6b4qYkP9webql5QNaJuCReVeko8mzNCVyFunhDwIV95v4lKjHttAFgjxTN1zvsVvJnc";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// iPadOS' WKWebView sends a desktop "Macintosh" user agent by default, so a
// stored UA can't be told apart from a real Mac later (parseUserAgent in
// notifications-section.tsx only sees this stored string, not the live
// navigator). iPads keep `maxTouchPoints > 1`; real Macs don't. Patch the UA
// at capture time so it reads as iPad, matching parseUserAgent's existing
// /iPhone|iPad/ check.
export function capturedUserAgent(): string {
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    return ua.replace("Macintosh", "iPad");
  }
  return ua;
}

function isAllowedEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (window.self !== window.top) return false; // no iframe
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
      platform: "web",
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: capturedUserAgent().slice(0, 255),
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
