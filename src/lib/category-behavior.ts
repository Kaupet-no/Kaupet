import { capitalizeWord } from "@/lib/utils";
import type {
  AttributeFilterValue,
  CategoryFilter,
  VehicleBrandGroup,
} from "@/lib/category-filters";

/**
 * A single extra breadcrumb segment appended after the category chain.
 * `slug: null` renders as plain (non-clickable) text; a non-null `slug`
 * links to `/annonser` for that category, optionally narrowed by `attrs`
 * (the same attribute-filter shape used by the search page).
 */
export type BreadcrumbSegment = {
  name_nb: string;
  slug: string | null;
  attrs?: Record<string, AttributeFilterValue>;
};

/**
 * Context needed to resolve extra breadcrumb segments, gathered once at the
 * breadcrumb-building call site. `rootCategorySlug` is the top-level
 * category slug (e.g. "bil-og-mc"), used as the search target for clickable
 * segments. `genericBrandFilter` is the listing's category's plain
 * text/select "brand" filter (see `genericBrandFilterFor`), if any.
 */
export type CategoryBreadcrumbContext = {
  rootCategorySlug: string | null;
  genericBrandFilter: CategoryFilter | null;
};

/**
 * Per-category-group flags that generic listing-creation/detail code branches
 * on. Consolidates what used to be a bare `isVehicle` boolean threaded
 * through several unrelated files (listings.functions.ts, delivery-location,
 * category-attributes, field-groups/registry.ts, validators.ts) so a new
 * flag only needs to be added in one place.
 */
export type CategoryBehavior = {
  /** Whether the listing must declare a delivery method (pickup/ship/both). Bil/MC and Båt opt out. */
  requiresDeliveryMethod: boolean;
  /** Whether the generic category-attributes field group should render. False for vehicles, whose attributes are captured via the vehicle-* field groups instead. */
  showGenericAttributes: boolean;
  /** Filter keys excluded from the required-attribute contract for this category behavior. */
  requiredFilterExclusions: readonly string[];
  /** Extra breadcrumb segments appended after the category chain, derived from the listing's attributes. */
  extraBreadcrumbSegments: (
    attributes: Record<string, unknown>,
    ctx: CategoryBreadcrumbContext,
  ) => BreadcrumbSegment[];
};

const DEFAULT_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: true,
  showGenericAttributes: true,
  requiredFilterExclusions: [],
  extraBreadcrumbSegments: (attributes, { rootCategorySlug, genericBrandFilter }) => {
    if (!genericBrandFilter) return [];
    const raw = attributes[genericBrandFilter.key];
    if (typeof raw !== "string" || !raw) return [];
    // Multiselect (not a single "select"/"text" value), matching the
    // vehicle Merke/Modell breadcrumb behavior — landing here shows every
    // other brand as a checkable option too (see the "brand" key branch in
    // category-filter-fields.tsx), not just this one fixed value.
    return [
      {
        name_nb: capitalizeWord(raw) ?? raw,
        slug: rootCategorySlug,
        attrs: {
          [genericBrandFilter.key]: { kind: "multiselect", values: [raw] },
        },
      },
    ];
  },
};

const VEHICLE_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: false,
  showGenericAttributes: false,
  requiredFilterExclusions: ["cylinders", "engine_code"],
  extraBreadcrumbSegments: (attributes, { rootCategorySlug }) => {
    const brand = typeof attributes.brand === "string" ? attributes.brand : null;
    const model = typeof attributes.model === "string" ? attributes.model : null;
    const segments: BreadcrumbSegment[] = [];
    // Multiselect (not a single "select"/"text" value) so landing on this
    // filtered search also shows the brand/model chips as checkbox lists the
    // user can broaden — e.g. clicking "Volvo" shows every brand as a
    // checkable option (Volvo pre-checked) and every Volvo model, not just
    // the one this listing happens to be.
    if (brand) {
      segments.push({
        name_nb: capitalizeWord(brand) ?? brand,
        slug: rootCategorySlug,
        attrs: { brand: { kind: "multiselect", values: [brand] } },
      });
    }
    if (model) {
      segments.push({
        name_nb: capitalizeWord(model) ?? model,
        slug: rootCategorySlug,
        attrs: {
          ...(brand ? { brand: { kind: "multiselect", values: [brand] } } : {}),
          model: { kind: "multiselect", values: [model] },
        },
      });
    }
    return segments;
  },
};

const BOAT_BEHAVIOR: CategoryBehavior = {
  ...DEFAULT_BEHAVIOR,
  requiresDeliveryMethod: false,
};

/** Resolves category behavior from a vehicle brand group or a boat flow. */
export function getCategoryBehavior(
  vehicleGroup: VehicleBrandGroup | null,
  isBoat = false,
): CategoryBehavior {
  if (vehicleGroup) return VEHICLE_BEHAVIOR;
  return isBoat ? BOAT_BEHAVIOR : DEFAULT_BEHAVIOR;
}
