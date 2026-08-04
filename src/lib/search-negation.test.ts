import { describe, expect, it } from "vitest";

import { negateSynonymMatches } from "./search-negation";
import type { SynonymMatch } from "@/features/listing-search/use-search-synonym-matches";

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

describe("negateSynonymMatches", () => {
  it("marks a match preceded by 'ikke' as negated and folds the word in", () => {
    const q = "ikke el bil";
    const m = match({ startWord: 1, endWord: 1, matchedText: "el" });
    const [result] = negateSynonymMatches(q, [m]);
    expect(result.negated).toBe(true);
    expect(result.startWord).toBe(0);
    expect(result.matchedText).toBe("ikke el");
  });

  it("marks a match preceded by 'uten' as negated", () => {
    const q = "uten hengerfeste";
    const m = match({
      startWord: 1,
      endWord: 1,
      matchedText: "hengerfeste",
      filterKey: "tow_hitch",
    });
    const [result] = negateSynonymMatches(q, [m]);
    expect(result.negated).toBe(true);
    expect(result.matchedText).toBe("uten hengerfeste");
  });

  it("leaves a match unchanged when not preceded by a negation word", () => {
    const q = "elektrisk el";
    const m = match({ startWord: 1, endWord: 1, matchedText: "el" });
    const [result] = negateSynonymMatches(q, [m]);
    expect(result.negated).toBeUndefined();
    expect(result).toBe(m);
  });

  it("does not negate when the preceding word is already consumed by another match", () => {
    const q = "ikke el bil";
    const negationOwner = match({
      startWord: 0,
      endWord: 0,
      matchedText: "ikke",
      filterKey: "other",
    });
    const m = match({ startWord: 1, endWord: 1, matchedText: "el" });
    const [, result] = negateSynonymMatches(q, [negationOwner, m]);
    expect(result.negated).toBeUndefined();
  });

  it("leaves a match at the start of the query unchanged", () => {
    const q = "el bil";
    const m = match({ startWord: 0, endWord: 0, matchedText: "el" });
    const [result] = negateSynonymMatches(q, [m]);
    expect(result.negated).toBeUndefined();
  });
});
