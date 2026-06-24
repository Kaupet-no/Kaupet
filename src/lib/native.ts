// Wrapper around Capacitor APIs. All functions are safe to call from web —
// they detect the runtime via `Capacitor.isNativePlatform()` and fall back
// to web behavior (or no-op) when running in a regular browser.

import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {
    /* ignore */
  }
  return "web";
}

/**
 * Take or pick a photo on native. Returns a File suitable for upload via
 * the existing web pipeline. Returns null if the user cancels.
 */
export async function pickNativePhoto(): Promise<File | null> {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      promptLabelHeader: "Legg til bilde",
      promptLabelPhoto: "Velg fra galleri",
      promptLabelPicture: "Ta bilde",
    });
    if (!photo.webPath) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const ext = (photo.format ?? "jpg").toLowerCase();
    const filename = `photo-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
    const type = blob.type || (ext === "png" ? "image/png" : "image/jpeg");
    return new File([blob], filename, { type });
  } catch (e: unknown) {
    // User canceled or denied permission
    const msg = e instanceof Error ? e.message : "";
    if (msg.toLowerCase().includes("cancel")) return null;
    throw e;
  }
}

/** Check location permission status without prompting the user. */
export async function checkLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!isNative()) return "granted";
  const { Geolocation } = await import("@capacitor/geolocation");
  const status = await Geolocation.checkPermissions();
  return status.location;
}

/** Request location permission from the user. */
export async function requestLocationPermission(): Promise<"granted" | "denied"> {
  if (!isNative()) return "granted";
  const { Geolocation } = await import("@capacitor/geolocation");
  const status = await Geolocation.requestPermissions();
  return status.location === "granted" ? "granted" : "denied";
}

/** Native GPS position. Falls back to navigator.geolocation on web. */
export async function getCurrentPosition(): Promise<GeolocationPosition | null> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? null,
        altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
        toJSON() {
          return this;
        },
      } as GeolocationCoordinates,
      timestamp: pos.timestamp,
      toJSON() {
        return this;
      },
    } as GeolocationPosition;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return await new Promise<GeolocationPosition | null>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}

/** Native share sheet. Falls back to navigator.share, then clipboard. */
export async function shareContent(opts: {
  title?: string;
  text?: string;
  url: string;
}): Promise<"native" | "web" | "clipboard"> {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.title ?? "Del",
    });
    return "native";
  }
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          share?: (d: { title?: string; text?: string; url: string }) => Promise<void>;
        })
      : null;
  if (nav && typeof nav.share === "function") {
    await nav.share({ title: opts.title, text: opts.text, url: opts.url });
    return "web";
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(opts.url);
    return "clipboard";
  }
  throw new Error("Deling støttes ikke i denne nettleseren");
}

/** Open a URL in an in-app browser on native; on web, opens a new tab. */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
