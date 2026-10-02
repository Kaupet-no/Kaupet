// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useScrollPinnedOffset } from "./use-scroll-pinned-offset";

/** setter scrollY og venter på at hookens rAF-oppdatering har gått. */
async function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event("scroll"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});

describe("useScrollPinnedOffset", () => {
  it("fester hjemme, holder rolig parallaks-fart, og fader i takt med at innholdet dekker elementet", async () => {
    // Fest til 100 px, halv fart. Gapet fra elementets bunn til innholdets
    // topp er 300 px ved scrollY 0; faden starter 32 px før innholdet tar
    // elementet og er ferdig når hele dets 120 px er dekket.
    const { result } = renderHook(() =>
      useScrollPinnedOffset(100, 0.5, { gap0: 300, startGapPx: 32, endGapPx: -120 }),
    );

    // Hjem-posisjon med full synlighet helt til festet slipper.
    await scrollTo(0);
    expect(result.current).toEqual({ offset: 0, opacity: 1 });
    await scrollTo(100);
    expect(result.current).toEqual({ offset: 0, opacity: 1 });

    // Etter festepunktet: halv fart — 200 px scroll gir 100 px forskjøving.
    await scrollTo(300);
    expect(result.current.offset).toBeCloseTo(-100);
    expect(result.current.opacity).toBe(1);

    // Innholdet når elementets bunn (gap = 32): faden starter her, og
    // farten er uendret — den øker ikke når innholdet nærmer seg.
    await scrollTo(436);
    expect(result.current.offset).toBeCloseTo(-168);
    expect(result.current.opacity).toBeCloseTo(1);

    // Halvveis dekket av innholdet: halvveis uttonet.
    await scrollTo(588);
    expect(result.current.offset).toBeCloseTo(-244);
    expect(result.current.opacity).toBeCloseTo(0.5);

    // Hele elementet dekket: helt uttonet — farten fortsatt rolig.
    await scrollTo(740);
    expect(result.current.offset).toBeCloseTo(-320);
    expect(result.current.opacity).toBe(0);
  });

  it("returnerer til hjem-posisjon og full synlighet ved scroll oppover", async () => {
    const { result } = renderHook(() =>
      useScrollPinnedOffset(100, 0.5, { gap0: 300, startGapPx: 32, endGapPx: -120 }),
    );

    await scrollTo(740);
    expect(result.current.opacity).toBe(0);

    await scrollTo(300);
    expect(result.current.offset).toBeCloseTo(-100);
    expect(result.current.opacity).toBe(1);

    await scrollTo(0);
    expect(result.current).toEqual({ offset: 0, opacity: 1 });
  });
});
