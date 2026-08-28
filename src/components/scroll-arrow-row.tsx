import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsNative } from "@/hooks/use-is-native";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Gap utility class between items. Default suits pill-style chips with
   * their own visible borders; pass "gap-0" when items should butt up
   * against each other and carry their own internal padding instead. */
  gapClassName?: string;
};

/**
 * Single-row, horizontally scrollable container with visible left/right
 * arrow buttons — used wherever a category chip/pill row must never wrap to
 * a second line (main categories on /annonser, subcategory chips in
 * CategoryHero). Arrows fade out at either scroll end instead of disappearing
 * outright, so their position stays predictable. Also click-and-drags with
 * the mouse (touch already scrolls natively via `overflow-x-auto`).
 */
export function ScrollArrowRow({ children, className, gapClassName = "gap-2" }: Props) {
  const isNative = useIsNative();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const dragMoved = useRef(false);
  const dragPointerId = useRef<number | null>(null);

  const update = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  });

  const scrollBy = (dir: 1 | -1) =>
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  // Mouse-drag-to-scroll — touch devices already get native panning from
  // `overflow-x-auto`, so this only kicks in for mouse pointers. Pointer
  // capture is deferred until real movement is seen (not grabbed on every
  // pointerdown) — capturing immediately would retarget the click that
  // follows a plain, un-dragged press from the button under the pointer to
  // this wrapper div, silently swallowing ordinary category clicks.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    dragMoved.current = false;
    dragPointerId.current = e.pointerId;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = el.scrollLeft;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartX.current;
    if (!dragMoved.current && Math.abs(dx) > 3) {
      dragMoved.current = true;
      if (dragPointerId.current != null) el.setPointerCapture(dragPointerId.current);
    }
    if (dragMoved.current) el.scrollLeft = dragStartScrollLeft.current - dx;
  };

  const endDrag = () => {
    setDragging(false);
    if (dragMoved.current && dragPointerId.current != null) {
      scrollRef.current?.releasePointerCapture(dragPointerId.current);
    }
    dragPointerId.current = null;
  };

  // Swallow the click a drag ends on, so releasing over a chip doesn't also
  // fire its onClick (a plain tap — no movement — still reaches it fine).
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragMoved.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="relative">
      {/* Full-height edge scrim, not a floating circle — a distinct rectangular
          shape flush to the container edge reads as "more content this way"
          on its own, rather than looking like just another rounded chip
          sitting in the row. Taller than the row itself (extends past its
          top/bottom edge) so it also reads as a separate navigation element
          rather than another category panel at the same height. */}
      {!isNative && (
        <div
          className={`pointer-events-none absolute -top-2 -bottom-2 left-0 z-10 flex w-10 items-center bg-background/95 transition-opacity ${
            canLeft ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Bla til venstre"
            tabIndex={canLeft ? 0 : -1}
            className={`flex h-full w-full items-center justify-start pl-1 ${
              canLeft ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition hover:bg-card">
              <ChevronLeft className="size-5" />
            </span>
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={`flex flex-nowrap items-start overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none] ${
          isNative ? "" : "px-10"
        } ${dragging ? "cursor-grabbing select-none scroll-auto" : "cursor-grab"} ${gapClassName} ${className ?? ""}`}
      >
        {children}
      </div>
      {!isNative && (
        <div
          className={`pointer-events-none absolute -top-2 -bottom-2 right-0 z-10 flex w-10 items-center justify-end bg-background/95 transition-opacity ${
            canRight ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Bla til høyre"
            tabIndex={canRight ? 0 : -1}
            className={`flex h-full w-full items-center justify-end pr-1 ${
              canRight ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition hover:bg-card">
              <ChevronRight className="size-5" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
