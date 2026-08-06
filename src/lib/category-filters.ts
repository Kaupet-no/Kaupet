import { z } from "zod";

/** Minimal category shape needed for filter inheritance (avoids requiring slug/name). */
export type CategoryNode = { id: string; parent_id: string | null };

/** Free-form per-category attribute values keyed by category_filters.key. */
export const attributesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

/** category_filters keys for the seks utstyr-gruppene (se
 * 20260724130000_bil_og_mc_utstyr_filters.sql). Lives here (rather than in
 * field-groups/vehicle-equipment, a React component module) so server code
 * — e.g. listings.functions.ts's createListing — can reference it without
 * pulling UI components into the server bundle. */
export const VEHICLE_EQUIPMENT_FILTER_KEYS = [
  "utstyr_teknisk",
  "utstyr_forerstotte",
  "utstyr_dekk",
  "utstyr_lys",
  "utstyr_interior",
  "utstyr_annet",
] as const;

export type FilterType =
  | "select"
  | "multiselect"
  | "number"
  | "range"
  | "boolean"
  | "text"
  | "brand_select"
  | "model_select";

export type FilterOption = { value: string; label_nb: string };

/** `category_filters` keys of type `"select"` where a listing carries one
 * value (a car has one body style/color/fuel type) but a buyer searching
 * should still be able to check several allowed values at once — rendered
 * as a checkbox list in the search UI (attribute-filter-chips.tsx,
 * category-filter-fields.tsx) while attribute-fields.tsx (listing creation)
 * keeps rendering the same `type: "select"` row as a single-value dropdown,
 * since that form is unaffected by this key list. */
export const SEARCH_MULTISELECT_KEYS: readonly string[] = ["body_type", "color", "fuel_type"];

/** Max digits allowed in the creation-flow input for numeric attribute keys
 * with a naturally bounded magnitude (a year has 4 digits, a boat length 3).
 * Keys not listed are unrestricted. Enforced by AttributeFields' number
 * input; keyed by category_filters.key so it applies across categories. */
export const NUMERIC_DIGIT_CAPS: Record<string, number> = {
  year: 4,
  length_ft: 3,
  engine_hours: 8,
  power_hk: 4,
  hestekrefter: 4,
  max_speed_knots: 3,
  sleeping_places: 2,
  seats: 3,
  width_cm: 4,
  depth_cm: 4,
  weight_kg: 7,
};

/** For brand_select filters, `unit` stores which vehicle_brands.category_group to read from. */
export type VehicleBrandGroup =
  "bil" | "motorsykkel" | "moped_atv" | "bobil_campingvogn" | "henger";

export const VEHICLE_BRAND_GROUP_LABELS_NB: Record<VehicleBrandGroup, string> = {
  bil: "Bil",
  motorsykkel: "Motorsykkel",
  moped_atv: "Moped/ATV",
  bobil_campingvogn: "Bobil/campingvogn",
  henger: "Tilhenger",
};

export type CategoryFilter = {
  id: string;
  category_id: string;
  key: string;
  label_nb: string;
  type: FilterType;
  unit: string | null;
  options: FilterOption[] | null;
  sort_order: number;
  is_primary: boolean;
  /** When set, this filter is only shown/required once the filter with key
   * `depends_on_key` on the same category has the value `depends_on_value`
   * (compared as a string). Null means always shown. */
  depends_on_key: string | null;
  depends_on_value: string | null;
  /** Inverse dependency: only shown/required while the `depends_on_key`
   * filter does NOT have this value — e.g. boat Drivstoff/Hestekrefter/
   * Maksfart hidden once Motortype = "uten_motor". */
  depends_on_not_value: string | null;
  /** Shown in the creation flow but never required (e.g. boat Driftstimer). */
  is_optional: boolean;
};

export const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  select: "Valg (én)",
  multiselect: "Valg (flere)",
  number: "Tall",
  range: "Tallområde (fra–til)",
  boolean: "Ja/nei",
  text: "Fritekst",
  brand_select: "Bilmerke (koblet)",
  model_select: "Bilmodell (koblet)",
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
  is_primary: boolean;
  depends_on_key?: string | null;
  depends_on_value?: string | null;
  depends_on_not_value?: string | null;
  is_optional?: boolean;
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
    is_primary: row.is_primary,
    depends_on_key: row.depends_on_key ?? null,
    depends_on_value: row.depends_on_value ?? null,
    depends_on_not_value: row.depends_on_not_value ?? null,
    is_optional: row.is_optional ?? false,
  };
}

/** Returns whether a filter's dependency (if any) is satisfied by the current
 * attribute values — e.g. Bilsport's "Gren"/"Klasse" only apply once
 * "Er bilen lisensiert?" is true. Filters without a dependency always apply. */
export function filterDependencyMet(
  filter: Pick<CategoryFilter, "depends_on_key" | "depends_on_value" | "depends_on_not_value">,
  attributes: Record<string, AttributeValue>,
): boolean {
  if (!filter.depends_on_key) return true;
  if (filter.depends_on_not_value != null) {
    return String(attributes[filter.depends_on_key]) !== filter.depends_on_not_value;
  }
  return String(attributes[filter.depends_on_key]) === filter.depends_on_value;
}

/**
 * Splits an already-resolved filter list into those always shown on the
 * landing/category filter panel vs. those tucked behind "Se flere valg".
 */
export function splitPrimaryFilters(filters: CategoryFilter[]): {
  primary: CategoryFilter[];
  secondary: CategoryFilter[];
} {
  return {
    primary: filters.filter((f) => f.is_primary),
    secondary: filters.filter((f) => !f.is_primary),
  };
}

/**
 * Applies a single attribute-filter change to a values map, used by every
 * `CategoryFilterFields` `onChange` handler (landing page, category page).
 * Removes the key entirely when the value is cleared, so empty filters don't
 * linger in the query/search state.
 */
export function setAttributeFilterValue(
  values: Record<string, AttributeFilterValue>,
  key: string,
  value: AttributeFilterValue | undefined,
): Record<string, AttributeFilterValue> {
  const next = { ...values };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
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

/**
 * Returns the effective filters (excluding "range", which is search-only, and
 * "boolean", which a plain checkbox can't distinguish "unanswered" from
 * "false" for) that don't yet have a value in `attributes`. Used to require
 * filter values to be filled in before a listing can be published/saved.
 */
export function getMissingRequiredFilters(
  categoryId: string | null,
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
  attributes: Record<string, AttributeValue>,
  excludeKeys?: readonly string[],
): CategoryFilter[] {
  const excluded = excludeKeys ? new Set(excludeKeys) : null;
  const filters = effectiveFiltersForCategory(categoryId, allFilters, categoriesById).filter(
    // "range" is search-only, "boolean" can't distinguish unanswered from
    // false, and "registration_number" is set by the vehicle wizard itself
    // (SVV lookup, or left unset for a manually entered unregistered
    // vehicle) rather than filled in by the user as a generic attribute.
    (f) =>
      f.type !== "range" &&
      f.type !== "boolean" &&
      !f.is_optional &&
      f.key !== "registration_number" &&
      !excluded?.has(f.key) &&
      filterDependencyMet(f, attributes),
  );
  return filters.filter((f) => {
    const v = attributes[f.key];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    return false;
  });
}

/**
 * Effective filters for a multi-category selection (e.g. the /annonser
 * category picker, which allows selecting several categories at once):
 * returns only filters common to every selected category (by key), since a
 * Bil-only field like "hestekrefter" doesn't make sense once "MC" is also
 * selected. Returns [] when no category is selected — attribute filters
 * only apply within a category context.
 */
export function effectiveFiltersForCategories(
  categoryIds: string[],
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFilter[] {
  if (categoryIds.length === 0) return [];
  const perCategory = categoryIds.map((id) =>
    effectiveFiltersForCategory(id, allFilters, categoriesById),
  );
  const [first, ...rest] = perCategory;
  const commonKeys = new Set(first.map((f) => f.key));
  for (const filters of rest) {
    const keys = new Set(filters.map((f) => f.key));
    for (const k of Array.from(commonKeys)) if (!keys.has(k)) commonKeys.delete(k);
  }
  return first.filter((f) => commonKeys.has(f.key)).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Returns the vehicle_brands.category_group a category should look up
 * brands/models from, or null if the category has no `brand_select` filter
 * (i.e. isn't a vehicle category). Shared by the vehicle-lookup module and
 * the title-photos field group so both agree on what counts as "a vehicle
 * category" — driven by admin-configured category_filters, not a hardcoded
 * category name/slug.
 */
export function vehicleCategoryGroupFor(
  categoryId: string | null,
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): VehicleBrandGroup | null {
  const filters = effectiveFiltersForCategory(categoryId, allFilters, categoriesById);
  const brandFilter = filters.find((f) => f.type === "brand_select");
  return (brandFilter?.unit as VehicleBrandGroup | undefined) ?? null;
}

/**
 * Returns every category whose `brand_select` filter reads from the given
 * `vehicle_brands.category_group` — i.e. the category/categories a brand in
 * that group belongs to. Computed live from `vehicleCategoryGroupFor` (driven
 * by admin-configured `category_filters`) rather than a hardcoded
 * `group -> slug` table, so it stays correct as the category tree is
 * restructured. Usually returns exactly one category (e.g. "bil" for the
 * "bil" group), but some groups now cover more than one category after being
 * split (e.g. "moped_atv" spans both "ATV" and "Snøscooter") — callers that
 * need a single answer must disambiguate among the results themselves.
 */
export function vehicleCategoriesForBrandGroup<
  T extends { id: string; slug: string; name_nb: string },
>(
  group: VehicleBrandGroup,
  categories: T[],
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): T[] {
  return categories.filter(
    (c) => vehicleCategoryGroupFor(c.id, allFilters, categoriesById) === group,
  );
}

/**
 * Returns the category's generic (non-vehicle) "brand" filter — a plain
 * text/select attribute keyed "brand" — or null if the category has none.
 * Distinct from `vehicleCategoryGroupFor`'s `brand_select`, which is a
 * structured, reference-table-backed filter type used only by vehicles.
 */
export function genericBrandFilterFor(
  categoryId: string | null,
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFilter | null {
  const filters = effectiveFiltersForCategory(categoryId, allFilters, categoriesById);
  return (
    filters.find((f) => f.key === "brand" && (f.type === "text" || f.type === "select")) ?? null
  );
}

/** Convenience boolean wrapper around `vehicleCategoryGroupFor`, for call
 * sites that only need to know "is this a vehicle category?" without caring
 * which brand group. */
export function isVehicleCategory(
  categoryId: string | null,
  allFilters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): boolean {
  return vehicleCategoryGroupFor(categoryId, allFilters, categoriesById) !== null;
}

/**
 * Builds a " › "-separated breadcrumb label for a category by walking up its
 * parent chain, e.g. "Elektronikk › TV og lyd › TV". Works for any depth.
 */
export function categoryBreadcrumb<
  T extends { id: string; parent_id: string | null; name_nb: string },
>(categoryId: string | null, categoriesById: Map<string, T>): string {
  if (!categoryId) return "";
  const path: string[] = [];
  let cur = categoriesById.get(categoryId);
  while (cur) {
    path.unshift(cur.name_nb);
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return path.join(" › ");
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
  | { kind: "text"; value: string }
  /** Excludes listings whose attribute equals any of `values` — a listing
   * with no value for this key is kept (e.g. "ikke elbil" shouldn't hide
   * listings that never set `fuel_type`). Currently only produced by the
   * free-text negation matcher (search-negation.ts) for select/multiselect
   * filters. */
  | { kind: "exclude"; values: string[] };

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
        // `->>` extracts JSON as text, so PostgREST compares it lexicographically
        // against the number ("78000" >= "100000" is true as text, since '7' > '1') —
        // `->` keeps it as jsonb instead, which numeric attribute values are always
        // stored as, so Postgres compares them numerically like the filter intends.
        if (typeof f.min === "number") q = q.gte(`attributes->${key}`, f.min);
        if (typeof f.max === "number") q = q.lte(`attributes->${key}`, f.max);
        break;
      case "text":
        if (f.value) q = q.ilike(`attributes->>${key}`, `%${f.value}%`);
        break;
      case "exclude":
        // Keep listings that never set this attribute — only exclude ones
        // that explicitly match one of the excluded values.
        if (f.values.length > 0) {
          q = q.or(
            `attributes->>${key}.is.null,attributes->>${key}.not.in.(${f.values.join(",")})`,
          );
        }
        break;
    }
  }
  return q as T;
}
