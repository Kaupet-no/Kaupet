import { useEffect, useState } from "react";

/**
 * Upward translate offset for a pinned element (the native home hero logo):
 * 0 — the home position — while window.scrollY stays at or below
 * `pinUntilPx`. Past that point the element scrolls up at `rate` times the
 * page speed (a slow parallax) — but never further up than
 * `clampBasePx - scrollY`: when that clamp binds, the element moves at the
 * page's own speed again, so content scrolling up from below always passes
 * by underneath it instead of over it. The offset is always <= 0, so
 * scrolling back up returns the element to the home position, where it
 * stays.
 */
export function useScrollPinnedOffset(
  pinUntilPx: number,
  rate: number,
  clampBasePx: number,
): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const pastPin = Math.max(0, window.scrollY - pinUntilPx);
      const slow = pastPin > 0 ? -rate * pastPin : 0;
      setOffset(Math.min(0, slow, clampBasePx - window.scrollY));
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
  }, [pinUntilPx, rate, clampBasePx]);

  return offset;
}
