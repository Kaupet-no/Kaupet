import { useEffect, useState } from "react";
import { isNative } from "@/lib/native";

export type FormFactor = "phone" | "tablet" | "web" | "desktop";

/** Grensen mellom kompakt og regulær bredde på native — Tailwinds `md`. */
const TABLET_MIN_WIDTH = 768;
/** Grensen der nettleseren har plass til sidekolonne-oppsett — Tailwinds `lg`. */
const DESKTOP_MIN_WIDTH = 1024;

/**
 * Formatfaktor-aksen: telefon og nettbrett er ulike formater, ikke samme
 * skjerm i to størrelser — og det samme gjelder en smal nettleser mot en
 * desktopskjerm. Kall den der oppsettet faktisk forgrener — ikke spre den som
 * en `isTablet`/`isDesktop`-boolsk rundt i koden (samme disiplin som
 * `CategoryBehavior`, se CLAUDE.md).
 *
 * Native gir "phone" | "tablet", nettleser gir "web" (< 1024px) | "desktop".
 * De to aksene blandes bevisst ikke: en native-nettbrettflate er ikke det
 * samme som kaupet.no i et 800px-vindu.
 *
 * Returnerer "web" på SSR + første render, av samme grunn som `useIsNative()`
 * — desktopoppsettet slår inn etter mount.
 */
export function useFormFactor(): FormFactor {
  const [factor, setFactor] = useState<FormFactor>("web");

  useEffect(() => {
    const native = isNative();
    // Uten matchMedia (jsdom, gamle webviews) blir "web" stående — samme
    // konservative standard som på SSR.
    const mq = window.matchMedia?.(
      `(min-width: ${native ? TABLET_MIN_WIDTH : DESKTOP_MIN_WIDTH}px)`,
    );
    if (!mq) return;
    const update = () =>
      setFactor(native ? (mq.matches ? "tablet" : "phone") : mq.matches ? "desktop" : "web");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return factor;
}

/** Nettleser på ≥1024px — flatene som skal ha sidekolonne i stedet for modal. */
export function useIsDesktop(): boolean {
  return useFormFactor() === "desktop";
}
