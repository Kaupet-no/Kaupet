import { describe, expect, it } from "vitest";

import {
  decodeAttrFilters,
  encodeAttrFilters,
  readAppliedSearchState,
  searchSchema,
  writeAppliedSearchState,
} from "./search-schema";
import type { AttributeFilterValue } from "@/lib/category-filters";

describe("encodeAttrFilters / decodeAttrFilters", () => {
  it("round-trips an exclude filter", () => {
    const values: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el", "diesel"] },
    };
    const encoded = encodeAttrFilters(values);
    expect(encoded).toBe("fuel_type:x:el|diesel");
    expect(decodeAttrFilters(encoded)).toEqual(values);
  });

  it("round-trips an exclude filter with a single value", () => {
    const values: Record<string, AttributeFilterValue> = {
      body_type: { kind: "exclude", values: ["kombi"] },
    };
    expect(decodeAttrFilters(encodeAttrFilters(values))).toEqual(values);
  });

  it("round-trips a mix of exclude and multiselect", () => {
    const values: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el"] },
      body_type: { kind: "multiselect", values: ["suv"] },
    };
    expect(decodeAttrFilters(encodeAttrFilters(values))).toEqual(values);
  });
});

describe("anvendt søkestate", () => {
  it("serialiserer AdvancedSearchValue og attributter gjennom én kontrakt", () => {
    const applied = readAppliedSearchState(
      searchSchema.parse({
        q: "Volvo V90",
        qMode: "any",
        category: "bil",
        conditions: ["good"],
        min: 100_000,
        max: 300_000,
        includeFree: false,
        sort: "price_asc",
        lat: 59.91,
        lng: 10.75,
        radius: 25,
        loc: "Oslo",
        attrs: encodeAttrFilters({
          fuel_type: { kind: "multiselect", values: ["el", "diesel"] },
          body_type: { kind: "select", value: "stasjonsvogn" },
        }),
      }),
    );

    expect(readAppliedSearchState(writeAppliedSearchState(applied))).toEqual(applied);
  });

  // Forsiden (native) navigerer til /annonser med bare `category`-parameteren
  // (se goToCategory i app-landing.tsx), mens valg på /annonser selv setter
  // `categories`-listen. Underkategoribrikkeraden drives av effectiveCategories,
  // så hvis denne fletingen ryker, forsvinner brikkene bare for forsiden-veien.
  it("fletter en enslig category-parameter (forsiden-navigering) inn i category-listen", () => {
    const applied = readAppliedSearchState(
      searchSchema.parse({ q: "", category: "elektronikk", sort: "new" }),
    );
    expect(applied.value.categories).toEqual(["elektronikk"]);
  });
});
