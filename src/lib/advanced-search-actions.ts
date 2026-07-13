import {
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import { mergeTermGroups } from "@/lib/term-groups";
import { summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";

/**
 * Resets only the filters owned by the advanced-search panel (categories,
 * price, condition, extra search lines) while preserving the fields owned by
 * the search bar above it — query terms, location, and sort. Resetting those
 * from inside this panel would be surprising, since the user didn't touch
 * them here.
 */
export function resetAdvancedSearchValue(v: AdvancedSearchValue): AdvancedSearchValue {
  return { ...defaultAdvancedSearchValue(), terms: v.terms, location: v.location, sort: v.sort };
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
  const criteria: SearchCriteria = { ...valueToCriteria(v), sort: sortOverride ?? v.sort };
  return { criteria, defaultName: summarizeCriteria(criteria) };
}
