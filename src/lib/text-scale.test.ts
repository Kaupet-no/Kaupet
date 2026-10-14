import { describe, expect, it, vi } from "vitest";

const textScaleGet = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ get: textScaleGet }) }));

import { clampScale, measureTextScale, readAndroidFontScale } from "./text-scale";

describe("clampScale", () => {
  it("holder seg innenfor 0,8–2 (WCAG 1.4.4-taket)", () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(3.1)).toBe(2);
    expect(clampScale(0.5)).toBe(0.8);
  });
});

/** Minimalt Document-stubb — `measureTextScale` bruker bare disse fire tingene. */
function fakeDoc(fontSize: string): Document {
  const probe = { style: {}, remove: () => {} };
  return {
    createElement: () => probe,
    body: { appendChild: () => {} },
    defaultView: { getComputedStyle: () => ({ fontSize }) },
  } as unknown as Document;
}

describe("measureTextScale", () => {
  it("returnerer null når plattformen ikke kjenner -apple-system-body", () => {
    // Det viktige: en ignorert font-deklarasjon må ikke leses som «brukeren
    // vil ha 16/17 = 6 % mindre tekst».
    vi.stubGlobal("CSS", { supports: () => false });
    expect(measureTextScale(fakeDoc("16px"))).toBeNull();
    vi.unstubAllGlobals();
  });

  it("leser skalaen som forholdet mot 17px", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    expect(measureTextScale(fakeDoc("34px"))).toBe(2);
    expect(measureTextScale(fakeDoc("17px"))).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("readAndroidFontScale (KG-39-F02)", () => {
  it("bruker systemets fontScale, klampet til samme tak som iOS", async () => {
    textScaleGet.mockResolvedValueOnce({ fontScale: 1.3 });
    expect(await readAndroidFontScale()).toBe(1.3);
    textScaleGet.mockResolvedValueOnce({ fontScale: 2.5 });
    expect(await readAndroidFontScale()).toBe(2);
  });

  it("er no-op når eldre app mangler broen", async () => {
    textScaleGet.mockRejectedValueOnce(new Error("not implemented"));
    expect(await readAndroidFontScale()).toBeNull();
  });
});
