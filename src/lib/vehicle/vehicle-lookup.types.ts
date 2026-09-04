export type VehicleLookupResult = {
  registrationNumber: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string | null;
  transmission: string | null;
  color: string | null;
  weight_kg: number | null;
  max_total_weight_kg: number | null;
  length_m: number | null;
  vin: string | null;
  next_eu_control: string | null;
  power_hk: number | null;
  drive_type: string | null;
  axle_count: number | null;
  tow_hitch: boolean | null;
  max_tow_weight_kg: number | null;
  seats: number | null;
  imported_used: boolean | null;
  first_registration_date: string | null;
  cylinders: number | null;
  engine_displacement_cc: number | null;
  engine_code: string | null;
  sleeping_places: number | null;
  classification_code: string | null;
  avgiftsklasse_code: string | null;
  avgiftsklasse_name: string | null;
  body_type_code: string | null;
  body_type_hint: string | null;
  body_type: string | null;
};

/** Filters that SVV can populate when available. Required keys from this set
 * remain editable on the searchable vehicle-facts step when the lookup has no
 * value for them. */
export const VEHICLE_LOOKUP_FILTER_KEYS = [
  "year",
  "fuel_type",
  "transmission",
  "drive_type",
  "weight_kg",
  "max_total_weight_kg",
  "length_m",
  "tow_hitch",
  "max_tow_weight_kg",
  "seats",
  "body_type",
  "imported_used",
  "color",
  "next_eu_control",
  "eu_control_exempt",
  "sleeping_places",
  "power_hk",
  "cylinders",
  "engine_displacement_cc",
  "engine_code",
] as const;

/** SVV can return these fields, but they are always optional in listing
 * creation, including when the lookup has no value. */
export const VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS = ["cylinders", "engine_code"] as const;

/** Attributes managed by the registration/SVV wizard rather than generic
 * category inputs. */
export const VEHICLE_WIZARD_MANAGED_KEYS = [
  "is_registered",
  "registration_number",
  "first_registration_year",
] as const;
