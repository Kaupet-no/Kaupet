import { describe, expect, it } from "vitest";

import {
  BRAND_FOREGROUND_DARK,
  BRAND_FOREGROUND_LIGHT,
  brandForegroundFor,
  isHexBrandColor,
  normalizeHexColor,
  resolveBrandColors,
} from "./brand-color";

describe("normalizeHexColor", () => {
  it("godtar med og uten firkant, og kortform", () => {
    expect(normalizeHexColor("#1A2B3C")).toBe("#1a2b3c");
    expect(normalizeHexColor(" 1a2b3c ")).toBe("#1a2b3c");
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
  });

  it("avviser ugyldige verdier", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("rød")).toBeNull();
    expect(isHexBrandColor("#abc")).toBe(false);
  });
});

describe("brandForegroundFor", () => {
  it("velger lesbar tekstfarge etter luminans", () => {
    expect(brandForegroundFor("#000000")).toBe(BRAND_FOREGROUND_LIGHT);
    expect(brandForegroundFor("#0d3b2e")).toBe(BRAND_FOREGROUND_LIGHT);
    expect(brandForegroundFor("#ffffff")).toBe(BRAND_FOREGROUND_DARK);
    expect(brandForegroundFor("#ffd400")).toBe(BRAND_FOREGROUND_DARK);
  });
});

describe("resolveBrandColors", () => {
  it("bruker egendefinert hex direkte", () => {
    expect(resolveBrandColors("#ffd400")).toEqual({
      background: "#ffd400",
      foreground: BRAND_FOREGROUND_DARK,
    });
  });

  it("faller tilbake til standardpaletten for ukjente og manglende verdier", () => {
    const fallback = resolveBrandColors("forest");
    expect(resolveBrandColors(null)).toEqual(fallback);
    expect(resolveBrandColors("tullefarge")).toEqual(fallback);
    expect(fallback.foreground).toBe(BRAND_FOREGROUND_LIGHT);
  });
});
