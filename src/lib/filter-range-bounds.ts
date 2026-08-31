import type { CategoryFilter } from "@/lib/category-filters";

/** Slider geometry for a from–to numeric filter. */
export type RangeBounds = {
  min: number;
  max: number;
  step: number;
  /** Unit suffix shown next to the thumb values, e.g. "kr" or "km". */
  unit?: string;
  /** Skips the nb-NO thousands-grouping in the displayed value — for a year,
   * "2026" is a label, not a quantity, so "2 026" would read as wrong rather
   * than as a formatted number. */
  noGrouping?: boolean;
};

/** Price is not a category_filter — it's a first-class listing column — so its
 * slider scale lives here next to the attribute scales rather than being
 * derived from filter metadata. */
export const PRICE_BOUNDS: RangeBounds = { min: 0, max: 1_000_000, step: 1000, unit: "kr" };

/** Price bounds sized to the current result set while preserving an active
 * selection and a usable fallback before the first facet response arrives. */
export function priceBoundsForMax(
  availableMax: number | null | undefined,
  selected?: { min?: number; max?: number },
): RangeBounds {
  const rawMax =
    availableMax === undefined
      ? PRICE_BOUNDS.max
      : Math.max(availableMax ?? PRICE_BOUNDS.step, selected?.min ?? 0, selected?.max ?? 0);
  const max = Math.max(
    PRICE_BOUNDS.step,
    Math.ceil(rawMax / PRICE_BOUNDS.step) * PRICE_BOUNDS.step,
  );
  return { ...PRICE_BOUNDS, max };
}

/** Per-key scales for the numeric attribute filters where a generic 0–100k
 * ramp would be useless (a year slider starting at 0, a mileage slider
 * stepping by 1 km). Keys match category_filters.key. */
const BOUNDS_BY_KEY: Record<string, Omit<RangeBounds, "unit">> = {
  year: { min: 1950, max: currentYear(), step: 1, noGrouping: true },
  part_fitment_year: { min: 1950, max: currentYear(), step: 1, noGrouping: true },
  rim_diameter: { min: 10, max: 30, step: 1, noGrouping: true },
  mileage_km: { min: 0, max: 500_000, step: 1000 },
  hestekrefter: { min: 0, max: 1000, step: 5 },
  effekt_hk: { min: 0, max: 1000, step: 5 },
  engine_size_ccm: { min: 0, max: 3000, step: 50 },
  vekt_kg: { min: 0, max: 5000, step: 50 },
};

/** Bounds for keys we have no explicit scale for, picked from the unit so a
 * "kr"-denominated attribute doesn't get a 0–1000 ramp. */
const BOUNDS_BY_UNIT: Record<string, Omit<RangeBounds, "unit">> = {
  km: { min: 0, max: 500_000, step: 1000 },
  kr: { min: 0, max: 1_000_000, step: 1000 },
  kg: { min: 0, max: 5000, step: 50 },
};

/** Bounds keyed by label rather than `key` — for filters whose
 * `category_filters.key` is reused across categories for a differently-scaled
 * attribute (e.g. "seats"/"capacity" also back "Sitteplasser"/"Kapasitet" on
 * a buss, which can run well past 16). Checked before `BOUNDS_BY_KEY`, so it
 * only narrows the specific labeled fields below, not every filter sharing
 * that key. */
const BOUNDS_BY_LABEL: Record<string, Omit<RangeBounds, "unit">> = {
  "Antall seter": { min: 0, max: 16, step: 1 },
  "Antall sylindre": { min: 0, max: 16, step: 1 },
  Effekt: { min: 0, max: 1000, step: 5 },
};

const DEFAULT_BOUNDS: Omit<RangeBounds, "unit"> = { min: 0, max: 10_000, step: 10 };

function currentYear() {
  return new Date().getFullYear();
}

/** Resolves the slider scale for a numeric (`number`/`range`) category filter. */
export function boundsForFilter(
  filter: Pick<CategoryFilter, "key" | "unit" | "label_nb">,
): RangeBounds {
  const base =
    BOUNDS_BY_LABEL[filter.label_nb] ??
    BOUNDS_BY_KEY[filter.key] ??
    (filter.unit ? BOUNDS_BY_UNIT[filter.unit] : undefined) ??
    DEFAULT_BOUNDS;
  return { ...base, unit: filter.unit ?? undefined };
}

/** Snaps a manually typed value into the slider's range, so a number typed
 * past the scale (e.g. a 900 000 km oldtimer) still moves the thumb to the end
 * instead of throwing Radix off with an out-of-range value. */
export function clampToBounds(value: number, bounds: RangeBounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

/** "120 000 km" / "2018" — space-grouped nb-NO digits plus the unit, unless
 * `noGrouping` (e.g. a year) asks for the plain digits instead. */
export function formatRangeValue(value: number, unit?: string, noGrouping?: boolean): string {
  const digits = noGrouping ? String(value) : value.toLocaleString("nb-NO");
  return unit ? `${digits} ${unit}` : digits;
}
