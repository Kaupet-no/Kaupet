import { describe, expect, it } from "vitest";
import { countActiveFilters } from "./search-summary-pill";

const none = {
  hasLocation: false,
  attrCount: 0,
  extraGroupCount: 0,
  qModeAny: false,
};

describe("countActiveFilters", () => {
  it("teller ingenting for et tomt søk", () => {
    expect(countActiveFilters({ ...none, includeFree: true })).toBe(0);
  });

  it("teller pris som ett filter uansett hvor mange grenser som er satt", () => {
    expect(countActiveFilters({ ...none, min: 100 })).toBe(1);
    expect(countActiveFilters({ ...none, min: 100, max: 900 })).toBe(1);
  });

  it("teller «uten gratis-annonser» som et prisfilter", () => {
    expect(countActiveFilters({ ...none, includeFree: false })).toBe(1);
    // `undefined` betyr «ikke satt», altså standardverdien true — ikke et filter.
    expect(countActiveFilters({ ...none, includeFree: undefined })).toBe(0);
  });

  it("teller tilstand som ett filter, ikke ett per valgt verdi", () => {
    expect(countActiveFilters({ ...none, conditions: ["new", "good"] })).toBe(1);
    expect(countActiveFilters({ ...none, conditions: [] })).toBe(0);
  });

  it("teller attributter, søkelinjer og sted hver for seg", () => {
    expect(
      countActiveFilters({
        min: 100,
        conditions: ["new"],
        hasLocation: true,
        attrCount: 2,
        extraGroupCount: 1,
        qModeAny: true,
      }),
    ).toBe(1 + 1 + 1 + 2 + 1 + 1);
  });
});
