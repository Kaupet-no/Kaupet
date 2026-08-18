import { describe, expect, it } from "vitest";

import { matchBrandAndModelInTitle } from "./vehicle-brand-match";

const brands = [
  { id: "porsche", name: "Porsche" },
  { id: "rover", name: "Rover" },
  { id: "land-rover", name: "Land Rover" },
  { id: "bmw", name: "BMW" },
];

const modelsByBrand: Record<string, { id: string; name: string; class_id: string | null }[]> = {
  porsche: [
    { id: "911", name: "911", class_id: null },
    { id: "718", name: "718", class_id: null },
  ],
  "land-rover": [{ id: "defender", name: "Defender", class_id: null }],
  bmw: [{ id: "320", name: "320", class_id: null }],
  rover: [],
};
const modelsForBrand = (brandId: string) => modelsByBrand[brandId] ?? [];

describe("matchBrandAndModelInTitle", () => {
  it("matches brand and model from a plain title", () => {
    expect(matchBrandAndModelInTitle("Porsche 911", brands, modelsForBrand)).toEqual({
      brand: "Porsche",
      model: "911",
    });
  });

  it("is case-insensitive and returns the canonical brand name", () => {
    expect(matchBrandAndModelInTitle("pen bmw 320 selges", brands, modelsForBrand)).toEqual({
      brand: "BMW",
      model: "320",
    });
  });

  it("prefers the longest brand match", () => {
    expect(matchBrandAndModelInTitle("Land Rover Defender", brands, modelsForBrand)).toEqual({
      brand: "Land Rover",
      model: "Defender",
    });
  });

  it("returns the brand alone when no model matches", () => {
    expect(matchBrandAndModelInTitle("Porsche til salgs", brands, modelsForBrand)).toEqual({
      brand: "Porsche",
      model: null,
    });
  });

  it("only matches whole words", () => {
    expect(matchBrandAndModelInTitle("Bmwx sykkel", brands, modelsForBrand)).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchBrandAndModelInTitle("Sykkel til salgs", brands, modelsForBrand)).toBeNull();
  });

  it("does not read the model from text before the brand", () => {
    // "911" foran merket er ikke modellen til Porsche her — bare det som
    // står etter merkenavnet regnes som modelltekst.
    expect(matchBrandAndModelInTitle("911 kroner Porsche", brands, modelsForBrand)).toEqual({
      brand: "Porsche",
      model: null,
    });
  });
});
