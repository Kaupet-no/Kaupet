import { useEffect, useState } from "react";

/**
 * Opacity that fades from 1 to 0 as the window scrolls down over `fadeDistance`
 * px. `enabled = false` keeps it at 1 and attaches no listener — for layouts
 * that don't fade on scroll (e.g. the native home hero on tablets).
 */
export function useScrollFadeOpacity(fadeDistance = 140, enabled = true): number {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setOpacity(Math.max(0, 1 - window.scrollY / fadeDistance));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [fadeDistance, enabled]);

  return opacity;
}
