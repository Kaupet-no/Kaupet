import { useEffect, useState } from "react";

/**
 * Upward translate offset and fade opacity for a pinned element (the native
 * home hero logo).
 *
 * offset — 0, the home position, while window.scrollY stays at or below
 * `pinUntilPx`. Past that point the element scrolls up at `rate` times the
 * page speed (a slow parallax) — all the way, so the page content rising
 * from below eventually catches up and slides over it. The offset is always
 * <= 0, so scrolling back up returns the element to the home position,
 * where it stays.
 *
 * opacity — 1 while the gap between the element's (translated) bottom edge
 * and the content's top edge stays wider than `fade.startGapPx`, then fades
 * linearly to 0 by `fade.endGapPx` (negative — the content has covered the
 * whole element). The gap shrinks by one px per scrolled px up to the pin
 * point and by (1 - rate) after it, since the element moves up too;
 * `fade.gap0` is the gap at scrollY 0, measured by the caller. Faded in
 * step with how much of the element the content has covered, the element
 * reads as sinking in behind the content coming from below.
 */
export function useScrollPinnedOffset(
  pinUntilPx: number,
  rate: number,
  fade: { gap0: number; startGapPx: number; endGapPx: number },
  enabled = true,
): { offset: number; opacity: number } {
  const [state, setState] = useState({ offset: 0, opacity: 1 });

  useEffect(() => {
    // `enabled = false` holder elementet hjemme og synlig, uten lytter —
    // for flater uten fastlåst hero (f.eks. nativeforsiden på nettbrett).
    if (!enabled) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const pastPin = Math.max(0, window.scrollY - pinUntilPx);
      // `pastPin === 0` gir rene 0 (unngår -0) i hjem-posisjonen.
      const offset = pastPin > 0 ? -rate * pastPin : 0;
      const gap = fade.gap0 - window.scrollY + rate * pastPin;
      const span = fade.startGapPx - fade.endGapPx;
      const opacity =
        span <= 0
          ? gap <= fade.endGapPx
            ? 0
            : 1
          : Math.min(1, Math.max(0, (gap - fade.endGapPx) / span));
      setState((previous) =>
        previous.offset === offset && previous.opacity === opacity ? previous : { offset, opacity },
      );
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
  }, [pinUntilPx, rate, fade.gap0, fade.startGapPx, fade.endGapPx, enabled]);

  return state;
}
