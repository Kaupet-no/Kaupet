import { useCallback, useSyncExternalStore } from "react";

/**
 * Reaktiv `window.matchMedia`-lesing som holder seg oppdatert når brukeren
 * endrer systeminnstilling eller vindusbredde mens appen er åpen. Brukes av
 * alt som forgrener på et media query i JS i stedet for via Tailwinds
 * responsive-/`motion-reduce:`-varianter, slik at samme lytter ikke
 * dupliseres per komponent.
 *
 * Returnerer `false` på SSR og første render, av samme grunn som
 * `useIsNative()` — den ekte verdien slår inn etter mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia?.(query);
      if (!mq?.addEventListener) return () => {};
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
