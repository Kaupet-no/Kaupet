import { describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { resolveTextToFilters } from "./resolve-text-to-filters";

vi.mock("./use-search-synonym-matches", async (importOriginal) => {
  const original = await importOriginal<typeof import("./use-search-synonym-matches")>();
  return {
    ...original,
    fetchSynonymMatches: vi.fn().mockImplementation((_categoryId: string | null, query: string) =>
      query.includes("kamera soltak")
        ? ["kamera", "soltak"].map((word, index) => ({
            startWord: index,
            endWord: index,
            matchedText: word,
            filterKey: "equipment",
            filterLabel: "Utstyr",
            optionValue: word === "kamera" ? "camera" : "roof",
            optionLabel: word,
            isAmbiguous: false,
            categoryId: null,
          }))
        : query.includes("automat")
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
          : query.toLowerCase().includes("rød")
            ? [
                {
                  startWord: 0,
                  endWord: 0,
                  matchedText: "Rød",
                  filterKey: "color",
                  filterLabel: "Farge",
                  optionValue: "red",
                  optionLabel: "Rød",
                  isAmbiguous: false,
                  categoryId: "bil",
                },
              ]
            : query.includes("hodetelefoner")
              ? [
                  {
                    startWord: 0,
                    endWord: 0,
                    matchedText: "hodetelefoner",
                    // A filter key that exists in no category passed to
                    // resolveTextToFilters — mirrors a globally-resolved synonym
                    // whose owning category is not in scope for this search.
                    filterKey: "accessory_type",
                    filterLabel: "Type",
                    optionValue: "hodetelefoner",
                    optionLabel: "Hodetelefoner",
                    isAmbiguous: false,
                    categoryId: "mobiltilbehor",
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
  it("lar fargeord være fritekst også når de finnes som filtersynonym", async () => {
    const resolved = await resolveTextToFilters({
      q: "Rød",
      categories: [],
      vehicleBrands: [],
      allFilters: [{ ...filters[1], key: "color", options: [{ value: "red", label_nb: "Rød" }] }],
    });

    expect(resolved.q).toBe("Rød");
    expect(resolved.attrPatch).toEqual({});
    expect(resolved.categorySlug).toBeUndefined();
  });

  it("beholder fritekst når synonymtreffet ikke gir et faktisk filter", async () => {
    // Uten dette ble frasen strippet fra q selv om ingen filter ble satt,
    // slik at søket «hodetelefoner» ga et tomt søk som traff alle annonser.
    const resolved = await resolveTextToFilters({
      q: "hodetelefoner",
      categories: [{ id: "sofa", slug: "sofa", name_nb: "Sofa", parent_id: null }],
      vehicleBrands: [],
      allFilters: filters,
    });

    expect(resolved.q).toBe("hodetelefoner");
    expect(resolved.attrPatch).toEqual({});
    expect(resolved.criteria).toEqual([]);
  });

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

  // KG-28-F03: bare første frase ble husket, så «soltak» forsvant ved fjerning.
  it("husker alle frasene som ble tolket til samme kriterium", async () => {
    const result = await resolveTextToFilters({
      q: "kamera soltak",
      categories: [],
      vehicleBrands: [],
      allFilters: [
        {
          id: "equipment",
          category_id: "bil",
          key: "equipment",
          label_nb: "Utstyr",
          type: "multiselect",
          unit: null,
          options: [],
          sort_order: 0,
          is_primary: false,
          depends_on_key: null,
          depends_on_value: null,
          depends_on_not_value: null,
          is_optional: false,
        },
      ],
    });
    expect(result.criteria).toEqual([
      expect.objectContaining({ key: "equipment", matchedText: "kamera soltak" }),
    ]);
  });
});
