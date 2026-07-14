import { useEffect, useRef, useState } from "react";
import { hapticImpact } from "./haptics";

type Options = {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
};

export function usePullToRefresh({ onRefresh, threshold = 64, enabled = true }: Options) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const hasFired = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      hasFired.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || window.scrollY > 0) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) return;
      setPulling(true);
      setPullDistance(Math.min(delta * 0.5, threshold * 1.5));
    };

    const onTouchEnd = async () => {
      if (!pulling || hasFired.current) {
        setPulling(false);
        setPullDistance(0);
        startY.current = null;
        return;
      }
      if (pullDistance >= threshold) {
        hasFired.current = true;
        setRefreshing(true);
        setPulling(false);
        setPullDistance(0);
        void hapticImpact("medium");
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      } else {
        setPulling(false);
        setPullDistance(0);
      }
      startY.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, pulling, pullDistance, threshold, onRefresh]);

  return { pulling, refreshing, pullDistance };
}
