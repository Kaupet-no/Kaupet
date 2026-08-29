import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

export type FilterRankInputs = {
  filters: CategoryFilter[];
  activeValues?: Record<string, AttributeFilterValue>;
  queryText?: string;
  facetCounts?: Record<string, Record<string, number>>;
  limit?: number;
};

function intentScore(filter: CategoryFilter, queryText: string): number {
  const words = queryText
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (words.length === 0) return 0;
  const haystack = [filter.label_nb, ...(filter.options ?? []).map((option) => option.label_nb)]
    .join(" ")
    .toLocaleLowerCase();
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

function facetScore(
  filter: CategoryFilter,
  facetCounts: Record<string, Record<string, number>> | undefined,
): number {
  return Object.values(facetCounts?.[filter.key] ?? {}).filter((count) => count > 0).length;
}

/**
 * Ranks only within the caller's category/filter scope. Every signal is
 * deterministic and sort_order remains the final tie-breaker.
 */
export function rankSearchFilters({
  filters,
  activeValues = {},
  queryText = "",
  facetCounts,
  limit,
}: FilterRankInputs): CategoryFilter[] {
  const ranked = [...filters].sort((a, b) => {
    const score = (filter: CategoryFilter) =>
      (activeValues[filter.key] ? 1000 : 0) +
      intentScore(filter, queryText) * 100 +
      facetScore(filter, facetCounts);
    return score(b) - score(a) || a.sort_order - b.sort_order;
  });
  return limit == null ? ranked : ranked.slice(0, limit);
}
