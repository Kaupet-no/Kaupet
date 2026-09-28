import { describe, expect, it } from "vitest";

import { bucketPrices, priceQuickRanges, priceScaleMax, roundToNicePrice } from "./price-histogram";

describe("bucketPrices", () => {
  it("fordeler prisene på like brede søyler og samler toppen i siste", () => {
    expect(bucketPrices([0, 100, 499, 500, 999, 5000], { min: 0, max: 1000 }, 2)).toEqual([3, 3]);
  });

  it("gir tomme søyler når intervallet er tomt", () => {
    expect(bucketPrices([10], { min: 5, max: 5 }, 3)).toEqual([0, 0, 0]);
  });
});

describe("roundToNicePrice", () => {
  it("runder til tall folk selv ville valgt", () => {
    expect(roundToNicePrice(1800)).toBe(2000);
    expect(roundToNicePrice(1550)).toBe(1500);
    expect(roundToNicePrice(7800)).toBe(8000);
    expect(roundToNicePrice(4700)).toBe(5000);
    expect(roundToNicePrice(42_300)).toBe(40_000);
    expect(roundToNicePrice(0)).toBe(0);
  });
});

describe("priceQuickRanges", () => {
  it("lager hurtigvalg fra kvartilene i søket", () => {
    const prices = [500, 1500, 1800, 2200, 3000, 4800, 5200, 7900, 8100, 9000, 12_000];
    // nb-NO grupperer med hardt mellomrom.
    const labels = priceQuickRanges(prices).map((range) => range.label.replace(/\s/g, " "));
    expect(labels).toEqual(["Under 2 000", "2 000–5 000", "Under 8 000"]);
  });

  it("gir ingen hurtigvalg når utvalget er for lite", () => {
    expect(priceQuickRanges([100, 200, 300])).toEqual([]);
  });
});

describe("priceScaleMax", () => {
  const prices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 250_000];

  it("slutter ved 95. persentil i stedet for dyreste annonse", () => {
    expect(priceScaleMax(prices, 1_000_000)).toBe(1000);
  });

  it("utvides til valgt maks og aldri over grensen", () => {
    expect(priceScaleMax(prices, 1_000_000, 5000)).toBe(5000);
    expect(priceScaleMax(prices, 800)).toBe(800);
  });

  it("bruker hele grensen når utvalget er for lite", () => {
    expect(priceScaleMax([100, 200], 50_000)).toBe(50_000);
  });
});
