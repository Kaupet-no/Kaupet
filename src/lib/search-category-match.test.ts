import { describe, expect, it } from "vitest";
import type { CategoryFilter, CategoryNode } from "@/lib/category-filters";
import { suggestVehicleCategoryForTitle } from "@/lib/search-category-match";

// Regresjonstest for F6 (sluttbrukertest): "Volvo V70 stasjonsvogn" ga «Vi
// fant ingen sikker kategori» siden suggest_category_for_title kun matcher
// mot historiske annonser og kategorinavn — verken "Volvo" eller "V70" er et
// kategorinavn. suggestVehicleCategoryForTitle er klient-fallbacken som
// gjenbruker søkets eksisterende merke-/attributtmatching for dette.

type Category = { id: string; slug: string; name_nb: string; parent_id: string | null };

const bilOgMc: Category = {
  id: "bilogmc",
  slug: "bil-og-mc",
  parent_id: null,
  name_nb: "Bil og MC",
};
const bil: Category = { id: "bil", slug: "bil", parent_id: "bilogmc", name_nb: "Bil" };
const mc: Category = { id: "mc", slug: "mc", parent_id: "bilogmc", name_nb: "MC" };
const sofa: Category = { id: "sofa", slug: "sofa", parent_id: "mobler", name_nb: "Sofa" };
const categories: Category[] = [bilOgMc, bil, mc, sofa];

const categoriesById = new Map<string, CategoryNode & { name_nb: string }>(
  categories.map((c) => [c.id, c]),
);

const allFilters: CategoryFilter[] = [
  {
    id: "f-body-type",
    category_id: "bil",
    key: "body_type",
    label_nb: "Karosseri",
    type: "select",
    unit: null,
    options: [{ value: "stasjonsvogn", label_nb: "Stasjonsvogn" }],
    sort_order: 0,
    is_primary: false,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
  {
    id: "f-brand-bil",
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
    id: "f-brand-mc",
    category_id: "mc",
    key: "brand",
    label_nb: "Merke",
    type: "brand_select",
    unit: "motorsykkel",
    options: null,
    sort_order: 0,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
];

const vehicleBrands = [{ name: "Volvo", category_group: "bil" as const }];

describe("suggestVehicleCategoryForTitle", () => {
  it("resolves a body-type attribute match straight to the exact leaf category (F6)", () => {
    const result = suggestVehicleCategoryForTitle(
      "Volvo V70 stasjonsvogn",
      vehicleBrands,
      allFilters,
      categories,
      categoriesById,
      bilOgMc.id,
    );
    expect(result).toEqual({
      category_id: "bil",
      parent_id: "bilogmc",
      name_nb: "Bil",
      parent_name_nb: "Bil og MC",
    });
  });

  it("falls back to a brand match when no category-exclusive attribute is mentioned", () => {
    const result = suggestVehicleCategoryForTitle(
      "Volvo V70 automat",
      vehicleBrands,
      allFilters,
      categories,
      categoriesById,
      bilOgMc.id,
    );
    expect(result?.category_id).toBe("bil");
  });

  it("suggests the Bil og MC root when a brand group spans more than one category", () => {
    const ambiguousBrands = [{ name: "Piaggio", category_group: "moped_atv" as const }];
    const ambiguousFilters: CategoryFilter[] = [
      { ...allFilters[1], id: "f-a", category_id: "bil", unit: "moped_atv" },
      { ...allFilters[2], id: "f-b", category_id: "mc", unit: "moped_atv" },
    ];
    const result = suggestVehicleCategoryForTitle(
      "Piaggio scooter",
      ambiguousBrands,
      ambiguousFilters,
      categories,
      categoriesById,
      bilOgMc.id,
    );
    expect(result?.category_id).toBe(bilOgMc.id);
  });

  it("does not touch a plain, non-vehicle title (regression: sofa must keep matching via the RPC path)", () => {
    const result = suggestVehicleCategoryForTitle(
      "Sluttbrukertest sofa i grå ull",
      vehicleBrands,
      allFilters,
      categories,
      categoriesById,
      bilOgMc.id,
    );
    expect(result).toBeNull();
  });
});
