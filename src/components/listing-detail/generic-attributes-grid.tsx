import { useMemo } from "react";

import { formatAttributeValue } from "@/components/listing-detail/format-attribute-value";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
import { useCategories } from "@/hooks/use-categories";
import {
  effectiveFiltersForCategory,
  filterDependencyMet,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type AttributeValue,
  type CategoryNode,
} from "@/lib/category-filters";

type Attrs = Record<string, unknown>;

/** Keys with a dedicated display component of their own — leaving them in
 * would render the same data twice. */
const RENDERED_ELSEWHERE = new Set<string>([
  ...VEHICLE_EQUIPMENT_FILTER_KEYS,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
]);

/**
 * Read-only spec grid for generic (non-vehicle, non-boat) category
 * attributes. Those verticals have hand-built grids (`VehicleInfoGrid`,
 * `BoatInfoGrid`) because their fields are known up front; here the fields
 * differ per category, so labels, units and option names come from
 * `category_filters` rather than a hardcoded map.
 *
 * Without this the wizard collected required attributes — material, size,
 * dimensions — that no buyer ever saw: the detail page only rendered them
 * behind the owner's edit mode.
 */
export function GenericAttributesGrid({
  categoryId,
  attributes,
  emptyHint,
}: {
  categoryId: string;
  attributes: Attrs;
  /** Shown instead of rendering nothing when no attribute has a value. Set
   * in edit mode so the owner still gets a click target to fill them in. */
  emptyHint?: string;
}) {
  const { data: filters } = useAllCategoryFilters();
  const { data: categories } = useCategories();

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const items = useMemo(() => {
    if (!filters) return [];
    const values = attributes as Record<string, AttributeValue>;
    return effectiveFiltersForCategory(categoryId, filters, categoriesById)
      .filter((f) => !RENDERED_ELSEWHERE.has(f.key))
      .filter((f) => filterDependencyMet(f, values))
      .map((f) => ({
        key: f.key,
        label: f.label_nb,
        value: formatAttributeValue(f, attributes[f.key]),
      }))
      .filter((item): item is { key: string; label: string; value: string } => item.value !== null);
  }, [filters, categoriesById, categoryId, attributes]);

  if (items.length === 0) {
    if (!emptyHint) return null;
    return (
      <section className="mt-8">
        <h2 className="font-display text-xl">Egenskaper</h2>
        <p className="mt-2 text-sm text-muted-foreground">{emptyHint}</p>
      </section>
    );
  }

  return (
    <section className="@container mt-8">
      <h2 className="font-display text-xl">Egenskaper</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 @md:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col items-start gap-1 text-sm">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{item.label}</span>
            <span className="min-w-0 leading-tight font-medium break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
