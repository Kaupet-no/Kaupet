import { describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { resolveTextToFilters } from "./resolve-text-to-filters";

vi.mock("./use-search-synonym-matches", async (importOriginal) => {
  const original = await importOriginal<typeof import("./use-search-synonym-matches")>();
  return {
    ...original,
    fetchSynonymMatches: vi.fn().mockResolvedValue([
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
    ]),
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
      { kind: "category", slug: "sofa", source: "text" },
      {
        kind: "attribute",
        key: "length_cm",
        value: { kind: "range", max: 300 },
        source: "text",
      },
      {
        kind: "attribute",
        key: "gearbox",
        value: { kind: "select", value: "automatic" },
        source: "text",
      },
    ]);
  });
});
