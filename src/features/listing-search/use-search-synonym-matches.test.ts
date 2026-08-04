import { describe, expect, it } from "vitest";

import { filterAmbiguousMatches, type SynonymMatch } from "./use-search-synonym-matches";

function match(
  partial: Partial<SynonymMatch> & { startWord: number; endWord: number },
): SynonymMatch {
  return {
    matchedText: "el",
    filterKey: "fuel_type",
    filterLabel: "Drivstoff",
    optionValue: "el",
    optionLabel: "El",
    isAmbiguous: false,
    categoryId: null,
    ...partial,
  };
}

describe("filterAmbiguousMatches", () => {
  it("drops an ambiguous match with no corroborating signal when no category is selected", () => {
    const elektrisk = match({
      startWord: 0,
      endWord: 0,
      matchedText: "elektrisk",
      isAmbiguous: true,
      categoryId: "bil-cat-id",
    });
    const result = filterAmbiguousMatches([elektrisk], null);
    expect(result).toEqual([]);
  });

  it("keeps an ambiguous match when another non-ambiguous match shares its category", () => {
    const elektrisk = match({
      startWord: 0,
      endWord: 0,
      matchedText: "elektrisk",
      isAmbiguous: true,
      categoryId: "bil-cat-id",
    });
    const suv = match({
      startWord: 1,
      endWord: 1,
      matchedText: "suv",
      filterKey: "body_type",
      filterLabel: "Karosseri",
      optionValue: "suv",
      optionLabel: "SUV",
      categoryId: "bil-cat-id",
    });
    const result = filterAmbiguousMatches([elektrisk, suv], null);
    expect(result).toEqual([elektrisk, suv]);
  });

  it("skips the gate entirely when a category is already selected", () => {
    const elektrisk = match({
      startWord: 0,
      endWord: 0,
      matchedText: "elektrisk",
      isAmbiguous: true,
      categoryId: "bil-cat-id",
    });
    const result = filterAmbiguousMatches([elektrisk], "bil-cat-id");
    expect(result).toEqual([elektrisk]);
  });
});
