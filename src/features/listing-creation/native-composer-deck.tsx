import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { composerSwipeDirection, type ComposerNavigationResult } from "./composer-navigation";

const GESTURE_EXCLUSION =
  "button, a, input, textarea, select, [contenteditable='true'], [role='slider'], [data-composer-no-swipe], [data-vaul-no-drag], .leaflet-container";

function gestureIsExcluded(target: EventTarget | null) {
  return target instanceof Element && target.closest(GESTURE_EXCLUSION) !== null;
}

export function NativeComposerDeck({
  enabled = true,
  onBack,
  onForward,
  children,
}: {
  enabled?: boolean;
  onBack?: () => void;
  onForward: () => Promise<ComposerNavigationResult>;
  children: ReactNode;
}) {
  const startRef = useRef<{ x: number; y: number; pointerId: number; time: number } | null>(null);
  const deltaRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query?.addEventListener) return;
    const onChange = () => setReduceMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (!enabled) return children;

  function clearGesture() {
    startRef.current = null;
    deltaRef.current = { x: 0, y: 0 };
    setDragging(false);
  }

  function animateEntrance(direction: "back" | "forward") {
    setDragging(true);
    setOffset(direction === "forward" ? 48 : -48);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setDragging(false);
        setOffset(0);
      }),
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (navigating || !event.isPrimary || gestureIsExcluded(event.target)) return;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      time: performance.now(),
    };
    deltaRef.current = { x: 0, y: 0 };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const delta = { x: event.clientX - start.x, y: event.clientY - start.y };
    deltaRef.current = delta;
    if (!reduceMotion && Math.abs(delta.x) > Math.abs(delta.y)) setOffset(delta.x * 0.6);
  }

  async function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = composerSwipeDirection(
      deltaRef.current.x,
      deltaRef.current.y,
      64,
      performance.now() - start.time,
    );
    clearGesture();
    if (direction === "back") {
      onBack?.();
      animateEntrance("back");
      return;
    }
    if (direction === "forward") {
      setNavigating(true);
      try {
        const result = await onForward();
        if (result === "advanced") animateEntrance("forward");
        else setOffset(0);
      } finally {
        setNavigating(false);
      }
    } else {
      setOffset(0);
    }
  }

  return (
    <div className="overflow-hidden" data-testid="native-composer-deck">
      <div
        data-testid="native-composer-card"
        aria-busy={navigating || undefined}
        className={cn(
          "native-composer-motion touch-pan-y will-change-transform",
          !dragging && "transition-transform motion-reduce:transition-none",
        )}
        style={{ transform: reduceMotion ? undefined : `translate3d(${offset}px, 0, 0)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => void handlePointerEnd(event)}
        onPointerCancel={() => {
          clearGesture();
          setOffset(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
