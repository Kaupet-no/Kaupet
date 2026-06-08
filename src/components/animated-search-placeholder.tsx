import { useEffect, useState } from "react";

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
  fade = 350,
  paused = false,
  className = "",
}: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (paused) return;
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
  }, [paused, hold, fade, words.length]);

  if (paused) return null;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none select-none truncate text-muted-foreground transition-opacity ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${fade}ms`,
      }}
    >
      {words[index]}
    </span>
  );
}
