import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import type { AttributeFilterValue } from "@/lib/category-filters";

function sortedAttributeEntries(values: Record<string, AttributeFilterValue>) {
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
}

/** Result count belongs to the applied URL query. Only show it while the
 * panel draft still matches that query; after an edit, the old count would
 * otherwise look like a live preview of filters that have not run yet. */
export function searchDraftMatchesApplied(
  draft: AdvancedSearchValue,
  draftAttributes: Record<string, AttributeFilterValue>,
  applied: AdvancedSearchValue,
  appliedAttributes: Record<string, AttributeFilterValue>,
) {
  return (
    JSON.stringify(draft) === JSON.stringify(applied) &&
    JSON.stringify(sortedAttributeEntries(draftAttributes)) ===
      JSON.stringify(sortedAttributeEntries(appliedAttributes))
  );
}
