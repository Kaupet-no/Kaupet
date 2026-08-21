import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

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

type ConditionValue = "new" | "like_new" | "good" | "acceptable" | "for_parts";

/**
 * Tilstand for kjøretøy (Bil og MC): fire kategorier per kjøretøytype, som
 * gjenbruker samme `condition`-enum og -kolonne som CONDITIONS (ingen
 * skjema-/DB-endring) — slik at et tilstandssøk på forsiden treffer både
 * vanlige annonser og kjøretøyannonser med samme underliggende verdi.
 *
 * `like_new` skrives aldri herfra: "som ny" og "pent brukt" er slått sammen
 * til én kategori per kjøretøytype (f.eks. "Bruktbil" for bil), lagret som
 * `good` — det gjør at et "Pent brukt"-søk blant vanlige annonser også
 * treffer alle brukte kjøretøy, uten at "like_new" står ubrukt og uoppdagbart
 * i søk. `new` var tidligere ubrukt for kjøretøy, men er nå med (Helt ny/Ny
 * bil skal også kunne søkes på tvers).
 */
export const VEHICLE_CONDITIONS_BY_SLUG: Record<
  VehicleLeafSlug,
  { value: ConditionValue; label: string }[]
> = {
  bil: [
    { value: "new", label: "Ny bil" },
    { value: "good", label: "Bruktbil" },
    { value: "acceptable", label: "Utbedringer må påregnes" },
    { value: "for_parts", label: "Reparasjonsobjekt/delebil" },
  ],
  motorsykkel: [
    { value: "new", label: "Ny MC" },
    { value: "good", label: "Brukt MC" },
    { value: "acceptable", label: "MC med slitasje" },
    { value: "for_parts", label: "MC i deler" },
  ],
  "moped-og-scooter": [
    { value: "new", label: "Ny moped/scooter" },
    { value: "good", label: "Brukt moped/scooter" },
    { value: "acceptable", label: "Moped/scooter med slitasje" },
    { value: "for_parts", label: "Moped/scooter i deler" },
  ],
  atv: [
    { value: "new", label: "Ny ATV" },
    { value: "good", label: "Brukt ATV" },
    { value: "acceptable", label: "ATV med slitasje" },
    { value: "for_parts", label: "ATV i deler" },
  ],
  snoscooter: [
    { value: "new", label: "Ny snøscooter" },
    { value: "good", label: "Brukt snøscooter" },
    { value: "acceptable", label: "Snøscooter med slitasje" },
    { value: "for_parts", label: "Snøscooter i deler" },
  ],
  "tilhenger-leaf": [
    { value: "new", label: "Ny tilhenger" },
    { value: "good", label: "Brukt tilhenger" },
    { value: "acceptable", label: "Tilhenger med slitasje" },
    { value: "for_parts", label: "Tilhenger i deler" },
  ],
  "lastebil-og-henger": [
    { value: "new", label: "Ny lastebil/henger" },
    { value: "good", label: "Brukt lastebil/henger" },
    { value: "acceptable", label: "Lastebil/henger med slitasje" },
    { value: "for_parts", label: "Lastebil/henger i deler" },
  ],
  "buss-og-minibuss": [
    { value: "new", label: "Ny buss/minibuss" },
    { value: "good", label: "Brukt buss/minibuss" },
    { value: "acceptable", label: "Buss/minibuss med slitasje" },
    { value: "for_parts", label: "Buss/minibuss i deler" },
  ],
  "traktor-og-redskap": [
    { value: "new", label: "Ny traktor/redskap" },
    { value: "good", label: "Brukt traktor/redskap" },
    { value: "acceptable", label: "Traktor/redskap med slitasje" },
    { value: "for_parts", label: "Traktor/redskap i deler" },
  ],
  anleggsmaskiner: [
    { value: "new", label: "Ny anleggsmaskin" },
    { value: "good", label: "Brukt anleggsmaskin" },
    { value: "acceptable", label: "Anleggsmaskin med slitasje" },
    { value: "for_parts", label: "Anleggsmaskin i deler" },
  ],
  campingvogn: [
    { value: "new", label: "Ny campingvogn" },
    { value: "good", label: "Brukt campingvogn" },
    { value: "acceptable", label: "Campingvogn med slitasje" },
    { value: "for_parts", label: "Campingvogn i deler" },
  ],
  bobil: [
    { value: "new", label: "Ny bobil" },
    { value: "good", label: "Brukt bobil" },
    { value: "acceptable", label: "Bobil med slitasje" },
    { value: "for_parts", label: "Bobil i deler" },
  ],
};

/** Flat value→label lookup per kjøretøytype, derived from
 * `VEHICLE_CONDITIONS_BY_SLUG` — used for display (listing detail/edit)
 * where only the value (not the full option list) is needed. */
export const VEHICLE_CONDITION_LABEL_BY_SLUG: Record<
  VehicleLeafSlug,
  Partial<Record<ConditionValue, string>>
> = Object.fromEntries(
  Object.entries(VEHICLE_CONDITIONS_BY_SLUG).map(([slug, options]) => [
    slug,
    Object.fromEntries(options.map((o) => [o.value, o.label])),
  ]),
) as Record<VehicleLeafSlug, Partial<Record<ConditionValue, string>>>;

export const STATUS_LABEL: Record<"draft" | "active" | "sold" | "archived" | "expired", string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};
