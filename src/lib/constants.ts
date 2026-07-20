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
 * Tilstand for kjøretøy (Bil og MC): en egen gradering av tilstand (ikke
 * alder/ny-vs-brukt, som for forbrukergoder) — reuses the same `condition`
 * enum values as CONDITIONS (no schema/DB change), mapping the four vehicle
 * grades onto like_new/good/acceptable/for_parts. `new` is deliberately
 * unused here since a vehicle grade is about condition, not "unused in box".
 */
export const VEHICLE_CONDITIONS = [
  {
    value: "like_new",
    label: "Utmerket",
    description: "Eksteriør uten skader, minimale skader på lakk, mekanisk uten avvik",
  },
  {
    value: "good",
    label: "Normal bruksslitasje",
    description: "Små riper. Kan ha behov for små, normale reparasjoner",
  },
  {
    value: "acceptable",
    label: "Godt brukt",
    description:
      "Tydelige skader på eksteriør eller interiør, kan ha behov for større mekaniske utbedringer",
  },
  {
    value: "for_parts",
    label: "Reparasjonsobjekt",
    description: "Kjøretøyet er ikke i kjørbar stand, eller har behov for betydelige utbedringer",
  },
] as const;

export const VEHICLE_CONDITION_LABEL: Record<string, string> = {
  like_new: "Utmerket",
  good: "Normal bruksslitasje",
  acceptable: "Godt brukt",
  for_parts: "Reparasjonsobjekt",
};

export const STATUS_LABEL: Record<"draft" | "active" | "sold" | "archived" | "expired", string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};
