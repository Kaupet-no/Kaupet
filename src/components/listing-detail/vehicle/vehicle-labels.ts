export const FUEL_LABEL_NB: Record<string, string> = {
  bensin: "Bensin",
  diesel: "Diesel",
  el: "El",
  // "hybrid" kept for listings saved before the split into bensin/diesel
  // hybrid (20260801130000_fuel_type_options_and_drop_first_reg_filter.sql).
  hybrid: "Hybrid",
  hybrid_bensin: "Hybrid (bensin + el)",
  hybrid_diesel: "Hybrid (diesel + el)",
  hydrogen: "Hydrogen",
  gass_cng: "Gass (CNG)",
  etanol_e85: "Etanol (E85)",
};

export const TRANSMISSION_LABEL_NB: Record<string, string> = {
  manuell: "Manuell",
  automat: "Automat",
};

export const DRIVE_TYPE_LABEL_NB: Record<string, string> = {
  forhjul: "Forhjulsdrift",
  bakhjul: "Bakhjulsdrift",
  "4x4": "Firehjulsdrift",
};
