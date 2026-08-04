/**
 * Extra `body_type` values to include when searching for a given value, on
 * top of the value itself — many SUVs are misclassified as "Kombi" by
 * sellers, so a search for "SUV" should also surface Kombi listings.
 * One-directional: searching "Kombi" does not also pull in "SUV".
 */
const BODY_TYPE_SEARCH_INCLUDES: Record<string, string[]> = {
  suv: ["kombi"],
};

/** Expands a set of `body_type` search values with their related values
 * from `BODY_TYPE_SEARCH_INCLUDES`, deduplicated. Only meant for building
 * the search query — does not affect which checkboxes appear selected. */
export function expandBodyTypeSearchValues(values: string[]): string[] {
  const expanded = new Set(values);
  for (const value of values) {
    for (const extra of BODY_TYPE_SEARCH_INCLUDES[value] ?? []) expanded.add(extra);
  }
  return Array.from(expanded);
}
