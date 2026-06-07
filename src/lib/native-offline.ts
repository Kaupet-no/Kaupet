// Native-only: shows a toast when the device loses or regains connectivity
// while the app is running. The bundled `capacitor-shell/offline.html` handles
// the case where the app cannot reach kaupet.no at launch.

import { toast } from "sonner";
import { isNative } from "./native";

let initialized = false;

export function initNativeOfflineWatcher(): () => void {
  if (initialized || !isNative() || typeof window === "undefined") {
    return () => {};
  }
  initialized = true;

  let offlineToastId: string | number | undefined;

  const onOffline = () => {
    offlineToastId = toast.error("Ingen internettforbindelse", {
      description: "Vi får ikke kontakt med Kaupet. Sjekk forbindelsen.",
      duration: Infinity,
    });
  };

  const onOnline = () => {
    if (offlineToastId !== undefined) {
      toast.dismiss(offlineToastId);
      offlineToastId = undefined;
    }
    toast.success("Tilkoblet igjen");
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  // Wire up Android hardware back button to navigate WebView history.
  let appCleanup: (() => void) | undefined;
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });
      appCleanup = () => {
        void handle.remove();
      };
    } catch {
      /* ignore — App plugin not available */
    }
  })();

  return () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    appCleanup?.();
    initialized = false;
  };
}
