import { useEffect, useRef } from "react";

import { isNative } from "@/lib/native";

/**
 * Kaller `onForeground` når fanen/appen får fokus igjen: `focus`,
 * `visibilitychange`, og — på native — `appStateChange` fra `@capacitor/app`,
 * siden de to første ikke er pålitelige i Capacitor-WebViewen.
 *
 * Delt uttrekk av mønsteret som tidligere var duplisert tre steder (de tre
 * tellerne i `use-unread.ts`); brukes også som fokus-fallback for den åpne
 * samtalen i `meldinger.$id.tsx`. `onForeground` leses via ref slik at en ny
 * funksjonsidentitet hvert render ikke fjerner/legger til listenere på nytt.
 */
export function useForegroundRefresh(onForeground: () => void, enabled: boolean) {
  const callbackRef = useRef(onForeground);
  useEffect(() => {
    callbackRef.current = onForeground;
  });

  useEffect(() => {
    if (!enabled) return;
    const fire = () => callbackRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fire();
    };
    window.addEventListener("focus", fire);
    document.addEventListener("visibilitychange", onVisibility);

    // På native fungerer ikke focus/visibilitychange pålitelig i Capacitor WebView
    let removeAppStateListener: (() => void) | undefined;
    if (isNative()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) fire();
        }).then((handle) => {
          removeAppStateListener = () => void handle.remove();
        });
      });
    }

    return () => {
      window.removeEventListener("focus", fire);
      document.removeEventListener("visibilitychange", onVisibility);
      removeAppStateListener?.();
    };
  }, [enabled]);
}
