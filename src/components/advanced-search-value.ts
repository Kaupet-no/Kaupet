import type { LocationValue } from "@/components/location-filter";
import type { SortValue } from "@/lib/categories";
import type { TermGroup } from "@/lib/term-groups";
import type { SearchCriteria } from "@/lib/saved-searches";

export const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "worn", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
];

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
    sort: v.sort,
    extraGroups: v.extraGroups,
    lat: v.location.lat,
    lng: v.location.lng,
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
    location: {
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      radius: c.radius ?? 10,
      label: c.loc ?? "",
    },
  };
}
