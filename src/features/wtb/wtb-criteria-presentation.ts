import {
  filterDependencyMet,
  pruneUntilStable,
  type AttributeValue,
  type CategoryFilter,
} from "@/lib/category-filters";
import {
  isWtbDateMinValue,
  isWtbRangeValue,
  WTB_FREETEXT_KEY,
  type WtbAttributeMap,
  type WtbAttributeValue,
} from "./wtb-criteria-types";

/** Beholder bare kriterier som kategoriens filtre fortsatt viser (også
 * avhengige filtre hvis forutsetning er borte), pluss fritekst. Brukes ved
 * kategori- og merkebytte, så gamle, usynlige krav ikke stopper treff
 * (KG-23-F02). `filters` er kategoriens effektive filtre. */
export function pruneWtbCriteria(
  value: WtbAttributeMap,
  filters: CategoryFilter[],
): WtbAttributeMap {
  const byKey = new Map(filters.map((filter) => [filter.key, filter]));
  return pruneUntilStable(value, (key, kept) => {
    if (key === WTB_FREETEXT_KEY) return true;
    const filter = byKey.get(key);
    return !!filter && filterDependencyMet(filter, kept as Record<string, AttributeValue>);
  }).kept;
}

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
  if (typeof freetext === "string" && freetext.trim()) summaries.push(`Nøkkelord: ${freetext}`);
  return summaries.join(" · ") || "Ingen begrensninger";
}

/** "Oslo (0150) · innen 50 km" — tom streng når kjøpsønsket ikke har område. */
export function wtbLocationLabel(location: {
  postal_code: string | null | undefined;
  city: string | null | undefined;
  radius_km: number | null | undefined;
}) {
  if (!location.postal_code) return "";
  const place = location.city ? `${location.city} (${location.postal_code})` : location.postal_code;
  return location.radius_km ? `${place} · innen ${location.radius_km} km` : place;
}
