import { AttributeFields } from "@/components/attribute-fields";

import type { WizardSharedProps } from "../types";

/** category_filters keys for the six utstyr-grupper (se
 * 20260724130000_bil_og_mc_utstyr_filters.sql) — brukt til å plukke ut kun
 * disse filtrene fra AttributeFields, som ellers ville vist alle kategoriens
 * effektive filtre (merke/modell/tekniske spesifikasjoner) på nytt her. */
export const VEHICLE_EQUIPMENT_FILTER_KEYS = [
  "utstyr_teknisk",
  "utstyr_forerstotte",
  "utstyr_dekk",
  "utstyr_lys",
  "utstyr_interior",
  "utstyr_annet",
] as const;

/**
 * Utstyr-steget for Bil og MC: seks avkrysningsgrupper (Teknisk,
 * Førerstøttesystemer, Dekk, Lys, Interiør, Annet), hver drevet av sin egen
 * `multiselect`-category_filter (alfabetisk sortert options-liste satt opp i
 * migrasjonen). Valgfritt — ingen `fieldsToValidate`/`validateExtra` i
 * registry.ts, siden manglende utstyrsinformasjon ikke skal blokkere
 * publisering. Lagt til som eget steg (ikke inni description-keywords) fordi
 * ~90 avkrysningsbokser ville gjort "Beskrivelse"-steget like overbelastet
 * som det UX-audit nettopp fjernet det for å være.
 */
export function VehicleEquipmentGroup({
  categoryId,
  categories,
  attributes,
  onAttributesChange,
}: WizardSharedProps) {
  return (
    <AttributeFields
      categoryId={categoryId}
      categories={categories ?? []}
      value={attributes}
      onChange={onAttributesChange}
      onlyKeys={VEHICLE_EQUIPMENT_FILTER_KEYS}
      title="Utstyr"
    />
  );
}
