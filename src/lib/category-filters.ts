import { z } from "zod";

/** Minimal category shape needed for filter inheritance (avoids requiring slug/name). */
export type CategoryNode = { id: string; parent_id: string | null };

/** Free-form per-category attribute values keyed by category_filters.key. */
export const attributesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);

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
  };
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
): CategoryFilter[] {
  const filters = effectiveFiltersForCategory(categoryId, allFilters, categoriesById).filter(
    // "range" is search-only, "boolean" can't distinguish unanswered from
    // false, and "registration_number" is set by the vehicle wizard itself
    // (SVV lookup, or left unset for a manually entered unregistered
    // vehicle) rather than filled in by the user as a generic attribute.
    (f) => f.type !== "range" && f.type !== "boolean" && f.key !== "registration_number",
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
