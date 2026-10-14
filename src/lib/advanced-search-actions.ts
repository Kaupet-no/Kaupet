import {
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/lib/advanced-search-value";
import { mergeTermGroups } from "@/lib/term-groups";
import { summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";

/**
 * Resets only the filters owned by the advanced-search panel (categories,
 * price, condition, extra search lines and the category attributes that
 * depend on them) while preserving the fields owned by the search bar above
 * it — query terms, location, and sort. Resetting those from inside this
 * panel would be surprising, since the user didn't touch them here.
 * Attributes are cleared with the categories: kept, they would narrow the
 * search with no visible control left (KG-29-F01).
 */
export function resetAdvancedSearchValue(v: AdvancedSearchValue): AdvancedSearchValue {
  return {
    ...defaultAdvancedSearchValue(),
    terms: v.terms,
    location: v.location,
    sort: v.sort,
    attributes: {},
  };
}

/** Merges duplicate/overlapping extra search-term groups before handing the
 * value off to the caller's `onApply`. */
export function mergeAdvancedSearchGroups(v: AdvancedSearchValue): AdvancedSearchValue {
  return { ...v, extraGroups: mergeTermGroups(v.extraGroups) };
}

export function buildAdvancedSearchCriteria(
  v: AdvancedSearchValue,
  sortOverride?: SearchCriteria["sort"],
) {
  const criteria: SearchCriteria = {
    ...valueToCriteria(v),
    sort: sortOverride ?? (v.sort === "relevance" ? "new" : v.sort),
  };
  return { criteria, defaultName: summarizeCriteria(criteria) };
}
