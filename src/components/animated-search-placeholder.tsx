import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type Props = {
  words: string[];
  /** ms each word stays fully visible */
  hold?: number;
  /** ms fade duration */
  fade?: number;
  /** pause animation (e.g. when input focused or has value) */
  paused?: boolean;
  className?: string;
};

/**
 * Crossfades whole words. Render this inside a `relative` container,
 * absolutely positioned over an input with empty placeholder.
 */
export function AnimatedSearchPlaceholder({
  words,
  hold = 2400,
  fade = 300,
  paused = false,
  className = "",
}: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Redusert bevegelse: fryser på første eksempel i stedet for å
    // kryssfade kontinuerlig gjennom listen — WCAG 2.2.2 ber om at
    // brukeren skal kunne skru av vedvarende, automatisk bevegelse.
    if (paused || reducedMotion) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setVisible(false);
      window.setTimeout(() => {
        if (cancelled) return;
        setIndex((i) => (i + 1) % words.length);
        setVisible(true);
      }, fade);
    };
    const id = window.setInterval(tick, hold + fade);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paused, reducedMotion, hold, fade, words.length]);

  if (paused) return null;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none select-none truncate text-muted-foreground ${
        reducedMotion ? "" : "transition-opacity"
      } ${className}`}
      style={
        reducedMotion
          ? undefined
          : {
              opacity: visible ? 1 : 0,
              transitionDuration: `${fade}ms`,
              transitionTimingFunction: "ease-in-out",
            }
      }
    >
      {words[index]}
    </span>
  );
}
