import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

const HINT_KEY = "kaupet_360_hint_seen";
const PX_PER_FRAME = 8;

export type Vehicle360Frame = { storage_path: string; frame_order: number };

/**
 * Dra-for-å-rotere "spin view" av en 360°-bildesekvens tatt via mobilappen
 * (se vehicle-360-qr-panel.tsx / 360-opptak-ruten). Rene pointer-events —
 * fungerer likt for mus (desktop) og touch (mobil).
 */
export function Vehicle360Viewer({
  frames,
  imgUrls,
  title,
}: {
  frames: Vehicle360Frame[];
  imgUrls: Record<string, string>;
  title: string;
}) {
  const sorted = frames.slice().sort((a, b) => a.frame_order - b.frame_order);
  const [index, setIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const dragState = useRef<{ startX: number; startIndex: number } | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_KEY)) setShowHint(true);
    } catch {
      /* ignore */
    }
  }, []);

  function dismissHint() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowHint(false);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startIndex: index };
    dismissHint();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current || sorted.length === 0) return;
    const delta = e.clientX - dragState.current.startX;
    const frameDelta = Math.round(delta / PX_PER_FRAME);
    let next = (dragState.current.startIndex - frameDelta) % sorted.length;
    if (next < 0) next += sorted.length;
    setIndex(next);
  }

  function onPointerUp() {
    dragState.current = null;
  }

  if (sorted.length === 0) return null;
  const current = sorted[index];
  const src = imgUrls[current.storage_path];

  return (
    <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-muted">
      {src && (
        <img
          src={src}
          alt={`360°-visning av ${title}`}
          className="size-full touch-none object-cover"
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      )}
      {/* Skjulte preload-bilder — unngår nettverksstall midt i drag-interaksjonen */}
      <div className="hidden">
        {sorted.map((f) =>
          imgUrls[f.storage_path] ? (
            <img key={f.storage_path} src={imgUrls[f.storage_path]} alt="" />
          ) : null,
        )}
      </div>
      {showHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">
            <RotateCw className="size-3.5" /> Dra for å rotere 360°
          </span>
        </div>
      )}
    </div>
  );
}
