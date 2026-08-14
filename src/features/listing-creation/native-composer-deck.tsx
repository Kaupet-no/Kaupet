import { useRef, useState, type PointerEvent, type ReactNode } from "react";

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
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const deltaRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (!enabled) return children;

  function resetGesture() {
    startRef.current = null;
    deltaRef.current = { x: 0, y: 0 };
    setDragging(false);
    setOffset(0);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (navigating || !event.isPrimary || gestureIsExcluded(event.target)) return;
    startRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
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
    const direction = composerSwipeDirection(deltaRef.current.x, deltaRef.current.y);
    resetGesture();
    if (direction === "back") {
      onBack?.();
      return;
    }
    if (direction === "forward") {
      setNavigating(true);
      try {
        await onForward();
      } finally {
        setNavigating(false);
      }
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
        onPointerCancel={resetGesture}
      >
        {children}
      </div>
    </div>
  );
}
