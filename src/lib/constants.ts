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

export const STATUS_LABEL: Record<"draft" | "active" | "sold" | "archived" | "expired", string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};
