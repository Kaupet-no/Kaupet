import { useEffect, useState } from "react";

/** Opacity that fades from 1 to 0 as the window scrolls down over `fadeDistance` px. */
export function useScrollFadeOpacity(fadeDistance = 140): number {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
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
  }, [fadeDistance]);

  return opacity;
}
