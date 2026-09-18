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
    options: [
      { value: "stasjonsvogn", label_nb: "Stasjonsvogn" },
      { value: "pickup", label_nb: "Pickup" },
    ],
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

const vehicleBrands = [{ id: "volvo", name: "Volvo", category_group: "bil" as const }];
const vehicleModels = [{ brand_id: "volvo", name: "V70" }];

describe("suggestVehicleCategoryForTitle", () => {
  it("resolves a body-type attribute match straight to the exact leaf category (F6)", () => {
    const result = suggestVehicleCategoryForTitle({
      title: "Volvo V70 stasjonsvogn",
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result).toEqual({
      category_id: "bil",
      parent_id: "bilogmc",
      name_nb: "Bil",
      parent_name_nb: "Bil og MC",
    });
  });

  it("falls back to a brand match when no category-exclusive attribute is mentioned", () => {
    const result = suggestVehicleCategoryForTitle({
      title: "Volvo V70 automat",
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result?.category_id).toBe("bil");
  });

  it("suggests the Bil og MC root when a brand group spans more than one category", () => {
    const ambiguousBrands = [
      { id: "piaggio", name: "Piaggio", category_group: "moped_atv" as const },
    ];
    const ambiguousModels = [{ brand_id: "piaggio", name: "Liberty" }];
    const ambiguousFilters: CategoryFilter[] = [
      { ...allFilters[1], id: "f-a", category_id: "bil", unit: "moped_atv" },
      { ...allFilters[2], id: "f-b", category_id: "mc", unit: "moped_atv" },
    ];
    const result = suggestVehicleCategoryForTitle({
      title: "Piaggio Liberty scooter",
      vehicleBrands: ambiguousBrands,
      vehicleModels: ambiguousModels,
      allFilters: ambiguousFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result?.category_id).toBe(bilOgMc.id);
  });

  it("does not touch a plain, non-vehicle title (regression: sofa must keep matching via the RPC path)", () => {
    const result = suggestVehicleCategoryForTitle({
      title: "Sluttbrukertest sofa i grå ull",
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result).toBeNull();
  });

  // Kodegjennomgangsfunn: en tittel som treffer et kjøretøymerke, men ingen
  // modell av det merket, må IKKE foreslå en kjøretøykategori — mange
  // merkenavn er også vanlige ord eller kjente ikke-kjøretøy-produktmerker
  // (f.eks. "Yamaha" på tastaturer/høyttalere), og et forslag her er ikke en
  // ett-klikk-reverserbar filter slik det er i søkefeltet, men det
  // CategoryConfirm-steget ber selgeren godta.
  it("does not suggest a vehicle category for a brand match with no matching model (Yamaha keyboard)", () => {
    const yamahaBrands = [{ id: "yamaha", name: "Yamaha", category_group: "motorsykkel" as const }];
    const yamahaModels = [{ brand_id: "yamaha", name: "MT-07" }];
    const result = suggestVehicleCategoryForTitle({
      title: "Yamaha keyboard P-125",
      vehicleBrands: yamahaBrands,
      vehicleModels: yamahaModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result).toBeNull();
  });

  // Kodegjennomgangsfunn: "Pickup" er en karosserietikett, men også et vanlig
  // norsk ord for gitar-/platespillerelement — ikke nok bevis alene for
  // wizardens kostbare, ikke-ett-klikk-reverserbare forslag.
  it("foreslår ingen kjøretøykategori for en tvetydig karosserietikett alene (Pickup til platespiller)", () => {
    const result = suggestVehicleCategoryForTitle({
      title: "Pickup til platespiller",
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result).toBeNull();
  });

  it("faller tilbake på merke+modell når karosserietiketten er tvetydig", () => {
    const result = suggestVehicleCategoryForTitle({
      title: "Volvo V70 pickup",
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId: bilOgMc.id,
    });
    expect(result?.category_id).toBe("bil");
  });
});
