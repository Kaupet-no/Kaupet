import type { CategoryFilter } from "@/lib/category-filters";
import {
  isWtbDateMinValue,
  isWtbRangeValue,
  WTB_FREETEXT_KEY,
  type WtbAttributeMap,
  type WtbAttributeValue,
} from "./wtb-criteria-types";

export function orderWtbCriteria(filters: CategoryFilter[], value: WtbAttributeMap) {
  return [...filters].sort((a, b) => Number(b.key in value) - Number(a.key in value));
}

export function criterionSummary(filter: CategoryFilter, value: WtbAttributeValue | undefined) {
  if (value === undefined) return "Ingen begrensning";
  if (Array.isArray(value)) {
    return value
      .map((entry) => filter.options?.find((option) => option.value === entry)?.label_nb ?? entry)
      .join(", ");
  }
  if (isWtbRangeValue(value)) {
    if (value.min != null && value.max != null) return `${value.min}–${value.max}`;
    if (value.min != null) return `Fra ${value.min}`;
    if (value.max != null) return `Til ${value.max}`;
  }
  if (isWtbDateMinValue(value)) return `Fra ${value.minDate}`;
  if (typeof value === "boolean") return value ? "Ja" : "Ingen begrensning";
  return String(value);
}

export function wtbCriteriaSummary(filters: CategoryFilter[], value: WtbAttributeMap) {
  const summaries = orderWtbCriteria(filters, value)
    .filter((filter) => filter.key in value)
    .map((filter) => {
      const label =
        filter.unit && filter.type !== "brand_select"
          ? `${filter.label_nb} (${filter.unit})`
          : filter.label_nb;
      return `${label}: ${criterionSummary(filter, value[filter.key])}`;
    });
  const freetext = value[WTB_FREETEXT_KEY];
  if (typeof freetext === "string" && freetext.trim()) summaries.push(`Fritekstsøk: ${freetext}`);
  return summaries.join(" · ") || "Ingen begrensninger";
}
