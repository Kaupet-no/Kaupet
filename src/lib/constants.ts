export const CONDITIONS = [
  { value: "new", label: "Helt ny", description: "Ubrukt, med eller uten original emballasje" },
  { value: "like_new", label: "Som ny", description: "Brukt svært lite — ingen synlige feil" },
  { value: "good", label: "Pent brukt", description: "Noe bruk, men i god stand" },
  {
    value: "acceptable",
    label: "Brukt med slitasje",
    description: "Tydelige bruksspor, men fungerer som normalt",
  },
  {
    value: "for_parts",
    label: "Må repareres",
    description: "Defekt eller mangler deler — selges for reparasjon",
  },
] as const;

export const CONDITION_LABEL: Record<string, string> = {
  new: "Helt ny",
  like_new: "Som ny",
  good: "Pent brukt",
  acceptable: "Brukt med slitasje",
  for_parts: "Må repareres",
};

/**
 * Tilstand for kjøretøy (Bil og MC): reuses the same `condition` enum values
 * as CONDITIONS (no schema/DB change), but only the three that make sense for
 * a vehicle, with vehicle-appropriate labels instead of the consumer-goods
 * ones above.
 */
export const VEHICLE_CONDITIONS = [
  { value: "new", label: "Ny", description: "Ubrukt kjøretøy" },
  { value: "good", label: "Brukt", description: "Brukt kjøretøy i vanlig stand" },
  {
    value: "for_parts",
    label: "Reparasjonsobjekt",
    description: "Defekt eller mangler deler — selges for reparasjon",
  },
] as const;

export const VEHICLE_CONDITION_LABEL: Record<string, string> = {
  new: "Ny",
  good: "Brukt",
  for_parts: "Reparasjonsobjekt",
};

export const STATUS_LABEL: Record<"draft" | "active" | "sold" | "archived" | "expired", string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};
