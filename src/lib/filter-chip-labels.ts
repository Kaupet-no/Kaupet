import { SORT_OPTIONS, type SortValue, type Category } from "@/lib/categories";

/**
 * Shared label/active-state derivation used by both NativeFilterChips and
 * DesktopFilterChips — kept in one place so the two platform-specific chip
 * rows can't drift on how a filter's label/active-state is computed.
 */
export function getSortChipState(sort: SortValue) {
  return {
    label: SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Nyeste",
    active: sort !== "new",
  };
}

export function getCategoryChipState(categories: Category[], selectedCategories: string[]) {
  const active = selectedCategories.length > 0;
  const label = active
    ? selectedCategories.length === 1
      ? (categories.find((c) => c.slug === selectedCategories[0])?.name_nb ?? "Kategori")
      : `${selectedCategories.length} kat.`
    : "Kategori";
  return { label, active };
}

export function getPriceChipState(
  min: number | undefined,
  max: number | undefined,
  includeFree: boolean,
) {
  const active = min != null || max != null || !includeFree;
  const label = active
    ? min != null && max != null
      ? `${min}–${max} kr`
      : min != null
        ? `Fra ${min} kr`
        : max != null
          ? `Til ${max} kr`
          : "Pris"
    : "Pris";
  return { label, active };
}

export function getConditionChipState(conditions: string[]) {
  const active = conditions.length > 0;
  return { label: active ? `${conditions.length} tilstand` : "Tilstand", active };
}
