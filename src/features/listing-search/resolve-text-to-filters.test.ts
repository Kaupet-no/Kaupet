import { describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { resolveTextToFilters } from "./resolve-text-to-filters";

vi.mock("./use-search-synonym-matches", async (importOriginal) => {
  const original = await importOriginal<typeof import("./use-search-synonym-matches")>();
  return {
    ...original,
    fetchSynonymMatches: vi.fn().mockImplementation((_categoryId: string | null, query: string) =>
      query.includes("automat")
        ? [
            {
              startWord: 0,
              endWord: 0,
              matchedText: "automat",
              filterKey: "gearbox",
              filterLabel: "Girkasse",
              optionValue: "automatic",
              optionLabel: "Automat",
              isAmbiguous: false,
              categoryId: "sofa",
            },
          ]
        : [],
    ),
  };
});

const filters: CategoryFilter[] = [
  {
    id: "length",
    category_id: "sofa",
    key: "length_cm",
    label_nb: "Lengde",
    type: "number",
    unit: "cm",
    options: null,
    sort_order: 0,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
  {
    id: "gearbox",
    category_id: "sofa",
    key: "gearbox",
    label_nb: "Girkasse",
    type: "select",
    unit: null,
    options: [{ value: "automatic", label_nb: "Automat" }],
    sort_order: 1,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
];

describe("resolveTextToFilters", () => {
  it("returnerer normalisert query og tolkede kriterier i tekstens rekkefølge", async () => {
    const resolved = await resolveTextToFilters({
      q: "Sofa under 300 cm automat klassiker",
      categories: [{ id: "sofa", slug: "sofa", name_nb: "Sofa", parent_id: null }],
      vehicleBrands: [],
      allFilters: filters,
    });

    expect(resolved.q).toBe("klassiker");
    expect(resolved.criteria).toEqual([
      { kind: "category", slug: "sofa", source: "text", matchedText: "Sofa" },
      {
        kind: "attribute",
        key: "length_cm",
        value: { kind: "range", max: 300 },
        source: "text",
        matchedText: "under 300 cm",
      },
      {
        kind: "attribute",
        key: "gearbox",
        value: { kind: "select", value: "automatic" },
        source: "text",
        matchedText: "automat",
      },
    ]);
  });
  it("tolker bilmerke og prisgrense uten å la operatoren bli fritekst", async () => {
    const resolved = await resolveTextToFilters({
      q: "Volvo under 300000kr",
      categories: [{ id: "bil-og-mc", slug: "bil-og-mc", name_nb: "Bil og MC", parent_id: null }],
      vehicleBrands: [{ name: "Volvo", category_group: "bil" }],
      allFilters: [],
    });

    expect(resolved.q).toBe("Volvo");
    expect(resolved.minPrice).toBeUndefined();
    expect(resolved.maxPrice).toBe(300000);
    expect(resolved.criteria).toEqual([
      {
        kind: "category",
        slug: "bil-og-mc",
        source: "text",
        matchedText: "Volvo",
      },
      {
        kind: "price",
        min: undefined,
        max: 300000,
        source: "text",
        matchedText: "under 300000kr",
      },
    ]);
  });
  it("tolker kilometergrense for et merke som kjøretøyfilter", async () => {
    const resolved = await resolveTextToFilters({
      q: "Volvo under 100000km",
      categories: [
        { id: "bil-og-mc", slug: "bil-og-mc", name_nb: "Bil og MC", parent_id: null },
        { id: "bil", slug: "bil", name_nb: "Bil", parent_id: "bil-og-mc" },
      ],
      vehicleBrands: [{ name: "Volvo", category_group: "bil" }],
      allFilters: [
        {
          id: "bil-brand",
          category_id: "bil",
          key: "brand",
          label_nb: "Merke",
          type: "brand_select",
          unit: "bil",
          options: null,
          sort_order: 0,
          is_primary: true,
          depends_on_key: null,
          depends_on_value: null,
          depends_on_not_value: null,
          is_optional: false,
        },
        {
          id: "bil-mileage",
          category_id: "bil",
          key: "mileage_km",
          label_nb: "Kilometerstand",
          type: "number",
          unit: "km",
          options: null,
          sort_order: 1,
          is_primary: true,
          depends_on_key: null,
          depends_on_value: null,
          depends_on_not_value: null,
          is_optional: false,
        },
      ],
    });

    expect(resolved.q).toBe("Volvo");
    expect(resolved.categorySlug).toBe("bil");
    expect(resolved.attrPatch).toEqual({
      mileage_km: { kind: "range", max: 100000 },
    });
  });
});
