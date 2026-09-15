import type { CategoryFilter } from "@/lib/category-filters";

function optionLabel(filter: CategoryFilter, value: string): string {
  return filter.options?.find((option) => option.value === value)?.label_nb ?? value;
}

/** Norwegian display value for one category attribute, or null when unset. */
export function formatAttributeValue(filter: CategoryFilter, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw ? "Ja" : "Nei";
  if (Array.isArray(raw)) {
    const labels = raw
      .filter((value): value is string => typeof value === "string" && value !== "")
      .map((value) => optionLabel(filter, value));
    return labels.length > 0 ? labels.join(", ") : null;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const value = raw.toLocaleString("nb-NO");
    return filter.unit ? `${value} ${filter.unit}` : value;
  }
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    const label = optionLabel(filter, raw);
    return filter.unit && label === raw ? `${raw} ${filter.unit}` : label;
  }
  return null;
}
