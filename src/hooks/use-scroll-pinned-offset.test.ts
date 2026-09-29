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
  it("fester hjemme, scroller saktere enn siden, og holder følge idet innholdet tar den igjen", async () => {
    // Fest til 300 px, halv fart, klemme fra 500: offset ≤ 500 − scrollY.
    const { result } = renderHook(() => useScrollPinnedOffset(300, 0.5, 500));

    // Før festepunktet: hjem-posisjon.
    await scrollTo(150);
    expect(result.current).toBe(0);

    // Etter festepunktet: halv fart — 100 px scroll gir 50 px forskjøving.
    await scrollTo(400);
    expect(result.current).toBe(-50);
    await scrollTo(600);
    expect(result.current).toBe(-150);

    // Når klemmen binder (700 px), følger elementet innholdets fart igjen:
    // 100 px videre scroll gir 100 px forskjøving, i stedet for at innholdet
    // scroller over det.
    await scrollTo(700);
    expect(result.current).toBe(-200);
    await scrollTo(800);
    expect(result.current).toBe(-300);
    await scrollTo(1000);
    expect(result.current).toBe(-500);

    // Scroll tilbake: elementet scroller til hjem-posisjonen og blir der.
    await scrollTo(400);
    expect(result.current).toBe(-50);
    await scrollTo(100);
    expect(result.current).toBe(0);
  });
});
