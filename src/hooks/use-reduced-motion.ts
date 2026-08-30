import { useEffect, useState } from "react";

/**
 * Leser `prefers-reduced-motion: reduce` og holder den oppdatert hvis
 * brukeren endrer systeminnstillingen mens appen er åpen. Delt av alt som
 * animerer uten å gå via Tailwinds `motion-reduce:`-varianter (f.eks.
 * JS-drevne intervaller/timeouts), slik at samme sjekk ikke dupliseres
 * per komponent.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
