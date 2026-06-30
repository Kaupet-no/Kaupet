/** Minimal category shape needed for filter inheritance (avoids requiring slug/name). */
export type CategoryNode = { id: string; parent_id: string | null };

export type FilterType = "select" | "multiselect" | "number" | "range" | "boolean" | "text";

export type FilterOption = { value: string; label_nb: string };

export type CategoryFilter = {
  id: string;
  category_id: string;
  key: string;
  label_nb: string;
  type: FilterType;
  unit: string | null;
  options: FilterOption[] | null;
  sort_order: number;
};

export const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  select: "Valg (én)",
  multiselect: "Valg (flere)",
  number: "Tall",
  range: "Tallområde (fra–til)",
  boolean: "Ja/nei",
  text: "Fritekst",
};

/** Coerces a raw DB row (options is JSONB) into a typed CategoryFilter. */
export function normalizeFilter(row: {
  id: string;
  category_id: string;
  key: string;
  label_nb: string;
  type: string;
  unit: string | null;
  options: unknown;
  sort_order: number;
}): CategoryFilter {
  return {
    id: row.id,
    category_id: row.category_id,
    key: row.key,
    label_nb: row.label_nb,
    type: row.type as FilterType,
    unit: row.unit,
    options: Array.isArray(row.options) ? (row.options as FilterOption[]) : null,
    sort_order: row.sort_order,
  };
}

/**
 * Returns the filters that apply to a category: its own filters plus those
 * inherited from its parent (so a filter defined on a main category is shared
 * by all its subcategories). Sorted by sort_order, deduped by key (the more
 * specific child filter wins over an inherited parent filter with the same key).
 */
export function effectiveFiltersForCategory(
  categoryId: string | null,
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFilter[] {
  if (!categoryId) return [];
  const applicableCategoryIds = new Set<string>();
  let cur: CategoryNode | undefined = categoriesById.get(categoryId);
  while (cur) {
    applicableCategoryIds.add(cur.id);
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  const byKey = new Map<string, CategoryFilter>();
  // Walk from least specific (parent) to most specific so children override.
  const ordered = allFilters
    .filter((f) => applicableCategoryIds.has(f.category_id))
    .sort(
      (a, b) => depthOf(a.category_id, categoriesById) - depthOf(b.category_id, categoriesById),
    );
  for (const f of ordered) byKey.set(f.key, f);
  return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order);
}

function depthOf(categoryId: string, categoriesById: Map<string, CategoryNode>): number {
  let depth = 0;
  let cur = categoriesById.get(categoryId);
  while (cur?.parent_id) {
    depth += 1;
    cur = categoriesById.get(cur.parent_id);
  }
  return depth;
}

export type AttributeValue = string | number | boolean | string[];
export type AttributeFilterValue =
  | { kind: "select"; value: string }
  | { kind: "multiselect"; values: string[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "range"; min?: number; max?: number }
  | { kind: "text"; value: string };

/**
 * Applies attribute filter predicates to a Supabase query on a table that has a
 * JSONB `attributes` column. Uses containment for select/boolean and JSONB
 * path casts for numeric range comparisons.
 */
// `query` is a Supabase PostgrestFilterBuilder; typed as any to avoid wrestling
// the deeply-generic builder type at every call site.
export function applyAttributeFilters<T>(
  query: T,
  filters: Record<string, AttributeFilterValue>,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  for (const [key, f] of Object.entries(filters)) {
    switch (f.kind) {
      case "select":
        if (f.value) q = q.contains("attributes", { [key]: f.value });
        break;
      case "boolean":
        q = q.contains("attributes", { [key]: f.value });
        break;
      case "multiselect":
        // Match listings whose attribute equals any of the selected values.
        if (f.values.length > 0) {
          const ors = f.values.map((v) => `attributes->>${key}.eq.${v}`).join(",");
          q = q.or(ors);
        }
        break;
      case "range":
        if (typeof f.min === "number") q = q.gte(`attributes->>${key}`, f.min);
        if (typeof f.max === "number") q = q.lte(`attributes->>${key}`, f.max);
        break;
      case "text":
        if (f.value) q = q.ilike(`attributes->>${key}`, `%${f.value}%`);
        break;
    }
  }
  return q as T;
}
