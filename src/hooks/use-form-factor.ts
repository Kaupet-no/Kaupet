import { useEffect, useState } from "react";
import { isNative } from "@/lib/native";

export type FormFactor = "phone" | "tablet" | "web";

/** Grensen mellom kompakt og regulær bredde — samme linje som Tailwinds `md`. */
const TABLET_MIN_WIDTH = 768;

/**
 * Formatfaktor-aksen for native: telefon og nettbrett er ulike formater, ikke
 * samme skjerm i to størrelser. Kall den der oppsettet faktisk forgrener —
 * ikke spre den som en `isTablet`-boolsk rundt i koden (samme disiplin som
 * `CategoryBehavior`, se CLAUDE.md).
 *
 * Returnerer "web" på SSR + første render, av samme grunn som `useIsNative()`.
 */
export function useFormFactor(): FormFactor {
  const [factor, setFactor] = useState<FormFactor>("web");

  useEffect(() => {
    if (!isNative()) return;
    const mq = window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`);
    const update = () => setFactor(mq.matches ? "tablet" : "phone");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return factor;
}
