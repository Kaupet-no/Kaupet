import type { AppliedSearchState } from "@/features/listing-search/search-schema";
import type { AttributeFilterValue } from "@/lib/category-filters";

function sortedAttributeEntries(values: Record<string, AttributeFilterValue>) {
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
}

/** Result count belongs to the applied URL query. Only show it while the
 * panel draft still matches that query; after an edit, the old count would
 * otherwise look like a live preview of filters that have not run yet. */
export function searchDraftMatchesApplied(draft: AppliedSearchState, applied: AppliedSearchState) {
  return (
    JSON.stringify(draft.value) === JSON.stringify(applied.value) &&
    JSON.stringify(sortedAttributeEntries(draft.attributes)) ===
      JSON.stringify(sortedAttributeEntries(applied.attributes))
  );
}
