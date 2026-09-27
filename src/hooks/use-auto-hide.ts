import { useCallback, useEffect, useRef, useState } from "react";

/** Synlig i `delay` ms etter mount og etter hvert kall til `show` (f.eks. fra
 * `onPointerMove`), deretter skjult. Brukes til karusellpilene i bildegalleriet. */
export function useAutoHide(delay = 2000) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), delay);
  }, [delay]);
  useEffect(() => {
    timer.current = setTimeout(() => setVisible(false), delay);
    return () => clearTimeout(timer.current);
  }, [delay]);
  return [visible, show] as const;
}

/** Klasser for et element som skjules med `useAutoHide` — tastaturfokus holder
 * det synlig. */
export const autoHideClass = (visible: boolean) =>
  `transition-opacity duration-300 ${visible ? "" : "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100"}`;
