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
  /** Whether the listing must declare a delivery method (pickup/ship/both). Vehicles can't be shipped, so this is false for them. */
  requiresDeliveryMethod: boolean;
  /** Whether the generic category-attributes field group should render. False for vehicles, whose attributes are captured via the vehicle-* field groups instead. */
  showGenericAttributes: boolean;
  /** Extra breadcrumb segments appended after the category chain, derived from the listing's attributes. */
  extraBreadcrumbSegments: (
    attributes: Record<string, unknown>,
    ctx: CategoryBreadcrumbContext,
  ) => BreadcrumbSegment[];
};

const DEFAULT_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: true,
  showGenericAttributes: true,
  extraBreadcrumbSegments: (attributes, { rootCategorySlug, genericBrandFilter }) => {
    if (!genericBrandFilter) return [];
    const raw = attributes[genericBrandFilter.key];
    if (typeof raw !== "string" || !raw) return [];
    return [
      {
        name_nb: capitalizeWord(raw) ?? raw,
        slug: rootCategorySlug,
        attrs: {
          [genericBrandFilter.key]: {
            kind: genericBrandFilter.type === "select" ? "select" : "text",
            value: raw,
          },
        },
      },
    ];
  },
};

const VEHICLE_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: false,
  showGenericAttributes: false,
  extraBreadcrumbSegments: (attributes, { rootCategorySlug }) => {
    const brand = typeof attributes.brand === "string" ? attributes.brand : null;
    const model = typeof attributes.model === "string" ? attributes.model : null;
    const segments: BreadcrumbSegment[] = [];
    if (brand) {
      segments.push({
        name_nb: capitalizeWord(brand) ?? brand,
        slug: rootCategorySlug,
        attrs: { brand: { kind: "text", value: brand } },
      });
    }
    if (model) {
      segments.push({
        name_nb: capitalizeWord(model) ?? model,
        slug: rootCategorySlug,
        attrs: {
          ...(brand ? { brand: { kind: "text", value: brand } } : {}),
          model: { kind: "text", value: model },
        },
      });
    }
    return segments;
  },
};

/** Resolves category behavior from a vehicle brand group (or null for non-vehicle categories), as returned by `vehicleCategoryGroupFor`. */
export function getCategoryBehavior(vehicleGroup: VehicleBrandGroup | null): CategoryBehavior {
  return vehicleGroup ? VEHICLE_BEHAVIOR : DEFAULT_BEHAVIOR;
}
