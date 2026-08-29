import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

export type StructuredSearchSuggestion = {
  id: string;
  filterKey: string;
  label: string;
  matchedText: string;
  value: AttributeFilterValue;
};
function matchScore(label: string, query: string): { score: number; matchedText: string } {
  const normalizedLabel = label.toLocaleLowerCase();
  const candidates = [query.trim(), ...query.trim().split(/\s+/)]
    .map((candidate) => candidate.toLocaleLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (normalizedLabel === candidate) return { score: 3, matchedText: candidate };
  }
  for (const candidate of candidates) {
    if (normalizedLabel.startsWith(candidate)) return { score: 2, matchedText: candidate };
  }
  for (const candidate of candidates) {
    if (normalizedLabel.includes(candidate)) return { score: 1, matchedText: candidate };
  }
  return { score: 0, matchedText: "" };
}
function isSelected(current: AttributeFilterValue | undefined, value: string): boolean {
  if (!current) return false;
  if (current.kind === "select") return current.value === value;
  if (current.kind === "multiselect" || current.kind === "exclude") {
    return current.values.includes(value);
  }
  return false;
}

export function buildStructuredSearchSuggestions(
  query: string,
  filters: CategoryFilter[],
  values: Record<string, AttributeFilterValue>,
  limit = 3,
): StructuredSearchSuggestion[] {
  const suggestions: Array<StructuredSearchSuggestion & { score: number; order: number }> = [];
  let order = 0;

  for (const filter of filters) {
    if (filter.type === "boolean") {
      const match = matchScore(filter.label_nb, query);
      const current = values[filter.key];
      const selected = current?.kind === "boolean" && current.value;
      if (match.score > 0 && !selected) {
        suggestions.push({
          id: `${filter.key}:true`,
          filterKey: filter.key,
          label: filter.label_nb,
          matchedText: match.matchedText,
          value: { kind: "boolean", value: true },
          score: match.score,
          order: order++,
        });
      }
      continue;
    }

    if (
      filter.type !== "select" &&
      filter.type !== "multiselect" &&
      filter.type !== "brand_select"
    ) {
      continue;
    }

    for (const option of filter.options ?? []) {
      const match = matchScore(option.label_nb, query);
      if (match.score === 0 || isSelected(values[filter.key], option.value)) continue;
      suggestions.push({
        id: `${filter.key}:${option.value}`,
        filterKey: filter.key,
        label: `${filter.label_nb}: ${option.label_nb}`,
        matchedText: match.matchedText,
        value:
          filter.type === "select"
            ? { kind: "select", value: option.value }
            : { kind: "multiselect", values: [option.value] },
        score: match.score,
        order: order++,
      });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ score: _score, order: _order, ...suggestion }) => suggestion);
}
