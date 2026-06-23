// Native push helpers for the Android app (Capacitor + FCM). Mirrors the
// Web Push flow in src/lib/push.ts, but stores an FCM registration token
// instead of a Web Push subscription. iOS is intentionally not wired up yet
// (no Apple Developer Program access — see README-CAPACITOR.md).

import { isNative, nativePlatform } from "@/lib/native";
import { savePushSubscription, deletePushSubscription } from "./push.functions";

export function nativePushSupported(): boolean {
  return isNative() && nativePlatform() === "android";
}

export async function getNativePermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!nativePushSupported()) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const status = await PushNotifications.checkPermissions();
  if (status.receive === "granted") return "granted";
  if (status.receive === "denied") return "denied";
  return "default";
}

let registeredToken: string | null = null;

export async function subscribeNative(): Promise<void> {
  if (!nativePushSupported()) {
    throw new Error("Native push-varsler støttes ikke på denne plattformen");
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    throw new Error("Tillatelse til varslinger ble ikke gitt");
  }

  const token = await new Promise<string>((resolve, reject) => {
    const registrationHandle = PushNotifications.addListener("registration", (token) => {
      void registrationHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      resolve(token.value);
    });
    const errorHandle = PushNotifications.addListener("registrationError", (err) => {
      void registrationHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      reject(new Error(err.error || "Kunne ikke registrere enheten for push"));
    });
    void PushNotifications.register();
  });

  registeredToken = token;
  await savePushSubscription({
    data: { platform: "android", fcm_token: token, user_agent: null },
  });
}

export async function unsubscribeNative(): Promise<void> {
  if (!nativePushSupported() || !registeredToken) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await deletePushSubscription({ data: { fcm_token: registeredToken } });
  await PushNotifications.unregister();
  registeredToken = null;
}

export async function getCurrentNativeToken(): Promise<string | null> {
  return registeredToken;
}

/**
 * Wires up tap-to-navigate on incoming notifications. Call once at app
 * startup on Android. Mirrors the `notificationclick` handler in
 * public/sw.js.
 */
export async function initNativePushNavigation(navigate: (url: string) => void): Promise<void> {
  if (!nativePushSupported()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification.data?.url;
    if (typeof url === "string" && url) navigate(url);
  });
}
