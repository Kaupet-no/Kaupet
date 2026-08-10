// Pinch-/dobbelttrykk-zoom med panorering, og sveip-ned-for-å-lukke når
// bildet ikke er zoomet (fase 6, se docs/NATIVE-UI-UX-PLAN.md).
//
// Egen transform, ikke nettleserens egen pinch: Capacitor slår av sidenivå-
// zoom i WebView-en (`zoomEnabled` er `false` som standard på begge
// plattformer), så det finnes ingen browser-gest å lene seg på. Se funn 10.10.

import { useEffect, useRef, useState } from "react";

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 120;

export type Transform = { s: number; x: number; y: number };
const IDENTITY: Transform = { s: 1, x: 0, y: 0 };

export type Point = { x: number; y: number };

type Gesture =
  | { mode: "pinch"; d0: number; c0: Point; t0: Transform }
  | { mode: "drag"; p0: Point; t0: Transform; moved: boolean };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type ClientPoint = { clientX: number; clientY: number };

function touchPoint(t: ClientPoint): Point {
  return { x: t.clientX, y: t.clientY };
}

function distance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Klamp panoreringen slik at man ikke kan dra bildet ut av containeren.
 *
 * ponytail: klampes mot containeren, ikke mot bildets faktiske
 * object-contain-rektangel. For smale bilder gir det litt slakk i sidene; mål
 * bildets rendrede størrelse hvis det viser seg å skurre.
 */
export function clampToBounds(next: Transform, width: number, height: number): Transform {
  if (next.s <= 1) return IDENTITY;
  const maxX = ((next.s - 1) * width) / 2;
  const maxY = ((next.s - 1) * height) / 2;
  return { s: next.s, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
}

/** Zoom slik at innholdspunktet under `anchor` blir stående i ro. */
export function scaleAround(t0: Transform, anchor: Point, s: number): Transform {
  return {
    s,
    x: anchor.x - ((anchor.x - t0.x) / t0.s) * s,
    y: anchor.y - ((anchor.y - t0.y) / t0.s) * s,
  };
}

type Props = {
  src: string;
  alt: string;
  /** Kalles når zoomtilstanden endres — brukes til å skru av Emblas dra-gest. */
  onZoomChange: (zoomed: boolean) => void;
  /** Sveip ned forbi terskelen. */
  onDismiss: () => void;
};

export function ZoomableImage({ src, alt, onZoomChange, onDismiss }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  const touched = useRef(false);
  const [t, setT] = useState<Transform>(IDENTITY);
  const [dragY, setDragY] = useState(0);
  // Egen state, ikke `gesture.current`: transisjonen er render-input, og en ref
  // lest under render er ikke garantert å utløse en ny render.
  const [gesturing, setGesturing] = useState(false);

  const zoomed = t.s > 1;
  useEffect(() => {
    onZoomChange(zoomed);
  }, [zoomed, onZoomChange]);

  /** Klientkoordinat → koordinat relativt til containerens senter. */
  function rel(p: Point): Point {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) };
  }

  function clampTransform(next: Transform): Transform {
    const r = containerRef.current?.getBoundingClientRect();
    return clampToBounds(next, r?.width ?? 0, r?.height ?? 0);
  }

  function onTouchStart(e: React.TouchEvent) {
    touched.current = true;
    setGesturing(true);
    if (e.touches.length >= 2) {
      gesture.current = {
        mode: "pinch",
        d0: distance(e.touches[0], e.touches[1]),
        c0: rel({
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }),
        t0: t,
      };
    } else {
      gesture.current = { mode: "drag", p0: touchPoint(e.touches[0]), t0: t, moved: false };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g) return;

    if (g.mode === "pinch") {
      if (e.touches.length < 2) return;
      const c = rel({
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      });
      const s = clamp((g.t0.s * distance(e.touches[0], e.touches[1])) / g.d0, 1, MAX_SCALE);
      const scaled = scaleAround(g.t0, g.c0, s);
      // Senterets egen forflytning panorerer i tillegg til zoomen.
      setT(clampTransform({ s, x: scaled.x + (c.x - g.c0.x), y: scaled.y + (c.y - g.c0.y) }));
      return;
    }

    const p = touchPoint(e.touches[0]);
    const dx = p.x - g.p0.x;
    const dy = p.y - g.p0.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) g.moved = true;

    if (g.t0.s > 1) {
      setT(clampTransform({ s: g.t0.s, x: g.t0.x + dx, y: g.t0.y + dy }));
    } else if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      // Uzoomet: vertikal dra = lukk. Horisontalt eier Embla gesten.
      setDragY(dy);
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const g = gesture.current;
    if (e.touches.length > 0) {
      // Fingre igjen på skjermen — start gesten på nytt fra gjeldende tilstand.
      gesture.current =
        e.touches.length >= 2
          ? null
          : { mode: "drag", p0: touchPoint(e.touches[0]), t0: t, moved: true };
      return;
    }
    gesture.current = null;
    setGesturing(false);

    if (dragY >= DISMISS_DISTANCE) {
      onDismiss();
      setDragY(0);
      return;
    }
    setDragY(0);

    if (g?.mode === "drag" && !g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        setT(
          t.s > 1 ? IDENTITY : clampTransform(scaleAround(IDENTITY, rel(g.p0), DOUBLE_TAP_SCALE)),
        );
      } else {
        lastTap.current = now;
      }
    }
  }

  const dragging = dragY > 0;

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ touchAction: zoomed ? "none" : undefined }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      // På touch eier bildet trykket selv: ett trykk må ikke lukke galleriet,
      // ellers er dobbelttrykk-zoom uoppnåelig (og et slipp etter panorering
      // ville lukket). Med mus (web) beholder bakteppet klikk-for-å-lukke.
      onClick={(e) => (touched.current || zoomed) && e.stopPropagation()}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="h-full w-full object-contain"
        style={{
          transform: `translate3d(${t.x}px, ${t.y + dragY}px, 0) scale(${t.s})`,
          opacity: dragging ? clamp(1 - dragY / (DISMISS_DISTANCE * 2.5), 0.3, 1) : 1,
          transition: gesturing ? "none" : "transform 150ms ease-out, opacity 150ms ease-out",
        }}
      />
    </div>
  );
}
