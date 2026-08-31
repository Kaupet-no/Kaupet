import type { AttributeFilterValue } from "@/lib/category-filters";
import type { LocationValue } from "@/components/location-filter";
import type { SortValue } from "@/lib/categories";
import type { TermGroup } from "@/lib/term-groups";
import type { SearchCriteria } from "@/lib/saved-searches";
import { VEHICLE_CONDITIONS_BY_SLUG } from "@/lib/constants";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

/** Root category slug for Bil og MC, which only lets a listing belong to one
 * subcategory at a time — unlike other categories, where an ad can carry
 * several sub-tags. The advanced search mirrors that by restricting
 * subcategory selection to one at a time. */
export const BIL_OG_MC_SLUG = "bil-og-mc";

export const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "acceptable", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
];

/** Bil og MC tillater kun én valgt underkategori om gangen (se
 * `BIL_OG_MC_SLUG` over), så "nøyaktig én valgt kategori, og den er en
 * kjøretøy-leaf" er riktig betingelse for å bytte til kjøretøyets egne
 * tilstandsetiketter — ellers vises det generiske settet. */
export function conditionOptionsFor(
  selectedCategorySlugs: string[],
): { value: string; label: string }[] {
  const vehicleOptions =
    selectedCategorySlugs.length === 1
      ? VEHICLE_CONDITIONS_BY_SLUG[selectedCategorySlugs[0] as VehicleLeafSlug]
      : undefined;
  return vehicleOptions ?? CONDITIONS;
}

export type AdvancedSearchValue = {
  terms: string[];
  qMode: "all" | "any";
  categories: string[];
  catMode: "all" | "any";
  conditions: string[];
  min: number | null;
  max: number | null;
  includeFree: boolean;
  location: LocationValue;
  sort: SortValue;
  extraGroups: TermGroup[];
  attributes?: Record<string, AttributeFilterValue>;
};

export function defaultAdvancedSearchValue(): AdvancedSearchValue {
  return {
    terms: [],
    qMode: "all",
    categories: [],
    catMode: "any",
    conditions: [],
    min: null,
    max: null,
    includeFree: true,
    location: { lat: null, lng: null, radius: 10, label: "" },
    attributes: {},
    sort: "new",
    extraGroups: [],
  };
}

export function valueToCriteria(v: AdvancedSearchValue): SearchCriteria {
  return {
    terms: v.terms,
    qMode: v.qMode,
    categories: v.categories,
    catMode: v.catMode,
    conditions: v.conditions,
    min: v.min,
    max: v.max,
    includeFree: v.includeFree,
    // Relevance sort has no meaning without a live query context, so a
    // saved search persists "new" instead.
    sort: v.sort === "relevance" ? "new" : v.sort,
    extraGroups: v.extraGroups,
    lat: v.location.lat,
    lng: v.location.lng,
    attributes: v.attributes ?? {},
    radius: v.location.lat != null ? v.location.radius : null,
    loc: v.location.label || undefined,
  };
}

export function criteriaToValue(c: SearchCriteria): AdvancedSearchValue {
  const terms = c.terms?.length ? c.terms : c.q ? c.q.split(/\s+/).filter(Boolean) : [];
  return {
    terms,
    qMode: c.qMode ?? "all",
    categories: c.categories ?? [],
    catMode: c.catMode ?? "any",
    conditions: c.conditions ?? [],
    min: c.min ?? null,
    max: c.max ?? null,
    includeFree: c.includeFree ?? true,
    sort: c.sort ?? "new",
    extraGroups: c.extraGroups ?? [],
    attributes: c.attributes ?? {},
    location: {
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      radius: c.radius ?? 10,
      label: c.loc ?? "",
    },
  };
}
