import type { AvgiftskodeGruppe, VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

export const LEAF_LABELS_NB: Record<VehicleLeafSlug, string> = {
  bil: "Bil",
  bobil: "Bobil",
  campingvogn: "Campingvogn",
  motorsykkel: "Motorsykkel",
  "moped-og-scooter": "Moped/scooter",
  atv: "ATV",
  snoscooter: "Snøscooter",
  "tilhenger-leaf": "Tilhenger",
  "lastebil-og-henger": "Lastebil/henger",
  "buss-og-minibuss": "Buss/minibuss",
  "traktor-og-redskap": "Traktor/redskap",
  anleggsmaskiner: "Anleggsmaskin",
};

export const AVGIFTSKODE_GRUPPE_LABELS_NB: Record<AvgiftskodeGruppe, string> = {
  personbil: "Personbil",
  varebil: "Varebil",
};

export const FUEL_TYPE_OPTIONS = [
  { value: "diesel", label: "Diesel" },
  { value: "bensin", label: "Bensin" },
  { value: "el", label: "Elektrisk" },
  { value: "hybrid_bensin", label: "Hybrid (bensin + el)" },
  { value: "hybrid_diesel", label: "Hybrid (diesel + el)" },
  { value: "hydrogen", label: "Hydrogen" },
  { value: "gass_cng", label: "Gass (CNG)" },
  { value: "etanol_e85", label: "Etanol (E85)" },
];

export const TRANSMISSION_OPTIONS = [
  { value: "manuell", label: "Manuell" },
  { value: "automat", label: "Automat" },
];

export const DRIVE_TYPE_OPTIONS = [
  { value: "4x4", label: "Firehjulsdrift" },
  { value: "bakhjul", label: "Bakhjulsdrift" },
  { value: "forhjul", label: "Forhjulsdrift" },
];

/** Mirrors the `color` category_filters options (see
 * supabase/migrations/20260722100000_vehicle_color_select_options.sql) so
 * registered and manually-entered vehicles store the same fixed values —
 * needed for the "uregistrert" search filter to work identically either way. */
export const COLOR_OPTIONS = [
  { value: "black", label: "Svart" },
  { value: "white", label: "Hvit" },
  { value: "silver", label: "Sølv" },
  { value: "gray", label: "Grå" },
  { value: "red", label: "Rød" },
  { value: "blue", label: "Blå" },
  { value: "green", label: "Grønn" },
  { value: "yellow", label: "Gul" },
  { value: "orange", label: "Oransje" },
  { value: "brown", label: "Brun" },
  { value: "beige", label: "Beige" },
  { value: "purple", label: "Lilla" },
  { value: "other", label: "Annen farge" },
];
