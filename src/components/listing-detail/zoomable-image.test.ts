import { describe, expect, it } from "vitest";
import { clampToBounds, scaleAround } from "./zoomable-image";

const IDENTITY = { s: 1, x: 0, y: 0 };

describe("scaleAround", () => {
  it("holder ankerpunktet i ro når man zoomer inn", () => {
    // Innholdspunktet under (100, 50) skal ligge under (100, 50) etterpå:
    // content = (anchor - x) / s, og anchor = x' + content * s'.
    const anchor = { x: 100, y: 50 };
    const next = scaleAround(IDENTITY, anchor, 2.5);
    const content = { x: (anchor.x - IDENTITY.x) / IDENTITY.s, y: (anchor.y - IDENTITY.y) / 1 };
    expect(next.x + content.x * next.s).toBeCloseTo(anchor.x);
    expect(next.y + content.y * next.s).toBeCloseTo(anchor.y);
  });

  it("er en no-op i senter", () => {
    expect(scaleAround(IDENTITY, { x: 0, y: 0 }, 3)).toEqual({ s: 3, x: 0, y: 0 });
  });
});

describe("clampToBounds", () => {
  it("nullstiller panorering når man zoomer helt ut", () => {
    expect(clampToBounds({ s: 1, x: 120, y: -80 }, 400, 800)).toEqual(IDENTITY);
  });

  it("hindrer at bildet dras utenfor containeren", () => {
    // 2× på 400px bred container gir maks 200px forskyvning hver vei.
    expect(clampToBounds({ s: 2, x: 999, y: -999 }, 400, 800)).toEqual({ s: 2, x: 200, y: -400 });
  });

  it("lar panorering innenfor grensen stå urørt", () => {
    expect(clampToBounds({ s: 2, x: 50, y: 50 }, 400, 800)).toEqual({ s: 2, x: 50, y: 50 });
  });
});
