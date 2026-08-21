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
  forhjul: "Forhjulstrekk",
  bakhjul: "Bakhjulstrekk",
  "4x4": "Firehjulstrekk",
};

/** Akselkombinasjon (bobil/lastebil/buss) — verdiene er selvforklarende
 * (4x2/6x4/8x8 osv.), så etiketten er identisk med verdien; egen map likevel
 * for symmetri med de andre *_LABEL_NB-oppslagene og i tilfelle det trengs
 * en annen visningstekst senere. */
export const AXLE_CONFIG_LABEL_NB: Record<string, string> = {
  "4x2": "4x2",
  "4x4": "4x4",
  "6x2": "6x2",
  "6x4": "6x4",
  "6x6": "6x6",
  "8x2": "8x2",
  "8x4": "8x4",
  "8x6": "8x6",
  "8x8": "8x8",
};
