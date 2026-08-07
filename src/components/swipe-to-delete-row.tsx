import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

const REVEAL_WIDTH = 88;
const OPEN_THRESHOLD = REVEAL_WIDTH * 0.4;

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
};

/**
 * iOS Mail-style "drag left to reveal delete". Pointer-based (same
 * drag-vs-tap threshold approach as ScrollArrowRow's mouse-drag handling)
 * rather than a gesture library — this is the only place in the app that
 * needs swipe-to-reveal, so a small dedicated component beats a dependency.
 */
export function SwipeToDeleteRow({ children, onDelete, deleteLabel = "Slett", className }: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startTranslate = useRef(0);
  const moved = useRef(false);
  const pointerId = useRef<number | null>(null);
  const pastThreshold = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    startTranslate.current = translateX;
    moved.current = false;
    pastThreshold.current = translateX <= -OPEN_THRESHOLD;
    pointerId.current = e.pointerId;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    if (!moved.current) {
      if (Math.abs(dx) < 5) return;
      moved.current = true;
      if (pointerId.current != null) e.currentTarget.setPointerCapture(pointerId.current);
    }
    const next = Math.min(0, Math.max(-REVEAL_WIDTH, startTranslate.current + dx));
    setTranslateX(next);
    const nowPast = next <= -OPEN_THRESHOLD;
    if (nowPast !== pastThreshold.current) {
      pastThreshold.current = nowPast;
      void hapticImpact("light");
    }
  };

  const endDrag = () => {
    setDragging(false);
    setTranslateX(pastThreshold.current ? -REVEAL_WIDTH : 0);
  };

  // Swallow the click a drag ends on (mirrors ScrollArrowRow), and treat a
  // plain tap on the row while it's open as "close" rather than letting it
  // reach whatever's underneath.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (moved.current) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = false;
      return;
    }
    if (translateX !== 0) {
      e.preventDefault();
      e.stopPropagation();
      setTranslateX(0);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-lg ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => {
          void hapticImpact("medium");
          setTranslateX(0);
          onDelete();
        }}
        aria-label={deleteLabel}
        style={{ width: REVEAL_WIDTH }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 bg-destructive text-xs font-medium text-destructive-foreground"
      >
        <Trash2 className="size-4" />
        {deleteLabel}
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
        className={dragging ? "" : "transition-transform duration-200"}
      >
        {children}
      </div>
    </div>
  );
}
