import { describe, expect, it } from "vitest";

import { parsePriceFilters } from "./search-number-parser";

describe("parsePriceFilters", () => {
  it("tolker under som øvre prisgrense", () => {
    expect(parsePriceFilters("Volvo under 300000kr")).toEqual([
      { matchedText: "under 300000kr", max: 300000 },
    ]);
  });

  it("tolker over som nedre prisgrense", () => {
    expect(parsePriceFilters("over 100 000 kr")).toEqual([
      { matchedText: "over 100 000 kr", min: 100000 },
    ]);
  });

  it("støtter norske tusenskilletegn og stor bokstav", () => {
    expect(parsePriceFilters("300.000 KR")).toEqual([{ matchedText: "300.000 KR", max: 300000 }]);
  });

  it("lar tall uten kroner-enhet være fritekst", () => {
    expect(parsePriceFilters("Volvo 300000")).toEqual([]);
  });
});
