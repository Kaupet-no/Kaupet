// Wrapper around Capacitor APIs. All functions are safe to call from web —
// they detect the runtime via `Capacitor.isNativePlatform()` and fall back
// to web behavior (or no-op) when running in a regular browser.

import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  // Dev-only: `?forcenative` slår på native-grenene i vanlig nettleser, slik at
  // de kan verifiseres uten simulator. `import.meta.env.DEV` er false i bygget,
  // så hele blokken strippes bort i produksjon.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    if (window.location.search.includes("forcenative")) return true;
  }
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Fades out and removes the boot-time overlay (see __root.tsx RootShell).
 * Call only after the native layout has actually painted — hiding it
 * earlier would re-expose the web-layout flash it exists to cover.
 */
export function hideNativeBootSplash(): void {
  const el = document.getElementById("native-boot-splash");
  document.documentElement.classList.remove("native-boot");
  if (!el) return;
  el.style.opacity = "0";
  window.setTimeout(() => el.remove(), 200);
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
  const s = status.location;
  if (s === "granted" || s === "denied") return s;
  return "prompt";
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

/**
 * Wires up Universal Links (iOS) / App Links (Android): when the OS opens
 * the app because the user tapped a https://kaupet.no/... link (e.g. a
 * scanned QR code, a shared link, a link in a message), Capacitor's App
 * plugin fires `appUrlOpen` with the full URL — route it into the app's own
 * router instead of leaving the WebView on its default page. Call once at
 * app startup. Mirrors the push-notification navigation wiring in
 * native-push.ts.
 */
export async function initUniversalLinkNavigation(navigate: (url: string) => void): Promise<void> {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", (data) => {
    try {
      const url = new URL(data.url);
      navigate(url.pathname + url.search + url.hash);
    } catch {
      // Ugyldig URL — ignorer i stedet for å krasje appen.
    }
  });
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
