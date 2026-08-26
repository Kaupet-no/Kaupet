import { format } from "date-fns";
import { SORT_OPTIONS, type SortValue, type Category } from "@/lib/categories";
import {
  PART_FITMENT_VEHICLE_IDS_KEY,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";
import { boundsForFilter } from "@/lib/filter-range-bounds";
import { parseIsoDate } from "@/lib/vehicle/vehicle-date";

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

/**
 * Label/active state for a single category-attribute chip (Merke, Modell,
 * Drivstoff, Årsmodell …) — the chip shows the chosen value rather than the
 * field name once the filter is set, matching how the generic chips behave.
 */
export function getAttributeChipState(
  filter: Pick<CategoryFilter, "key" | "label_nb" | "unit" | "options">,
  value: AttributeFilterValue | undefined,
) {
  const fallback = { label: filter.label_nb, active: false };
  if (!value) return fallback;
  switch (value.kind) {
    case "multiselect":
      if (value.values.length === 0) return fallback;
      return {
        label:
          filter.key === PART_FITMENT_VEHICLE_IDS_KEY
            ? `${filter.label_nb} (${value.values.length})`
            : value.values.length === 1
              ? (filter.options?.find((o) => o.value === value.values[0])?.label_nb ??
                value.values[0])
              : `${filter.label_nb} (${value.values.length})`,
        active: true,
      };
    case "boolean":
      return value.value ? { label: filter.label_nb, active: true } : fallback;
    case "text":
      return value.value ? { label: value.value, active: true } : fallback;
    case "range": {
      if (value.min == null && value.max == null) return fallback;
      const unit = filter.unit ? ` ${filter.unit}` : "";
      const noGrouping = boundsForFilter(filter).noGrouping;
      const fmt = (n: number) => (noGrouping ? String(n) : n.toLocaleString("nb-NO"));
      const label =
        value.min != null && value.max != null
          ? `${fmt(value.min)}–${fmt(value.max)}${unit}`
          : value.min != null
            ? `Fra ${fmt(value.min)}${unit}`
            : `Til ${fmt(value.max!)}${unit}`;
      return { label, active: true };
    }
    case "date_min": {
      if (!value.value) return fallback;
      const d = parseIsoDate(value.value);
      return { label: d ? `Fra ${format(d, "dd.MM.yyyy")}` : filter.label_nb, active: true };
    }
  }
  return fallback;
}
