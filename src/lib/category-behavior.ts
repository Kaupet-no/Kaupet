import type { VehicleBrandGroup } from "@/lib/category-filters";

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
};

const DEFAULT_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: true,
  showGenericAttributes: true,
};

const VEHICLE_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: false,
  showGenericAttributes: false,
};

/** Resolves category behavior from a vehicle brand group (or null for non-vehicle categories), as returned by `vehicleCategoryGroupFor`. */
export function getCategoryBehavior(vehicleGroup: VehicleBrandGroup | null): CategoryBehavior {
  return vehicleGroup ? VEHICLE_BEHAVIOR : DEFAULT_BEHAVIOR;
}
