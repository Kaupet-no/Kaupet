import { todayIsoDate } from "@/lib/category-filters";

/** Selgerens alternativ til en tom eller passert «Neste EU-kontroll»
 * (`attributes.eu_control_status`, filterrad i 20261015140000). */
export type EuControlStatus = "missing" | "exempt";

export const EU_CONTROL_STATUS_LABEL_NB: Record<EuControlStatus, string> = {
  missing: "Mangler EU-kontroll",
  exempt: "Fritatt for EU-kontroll",
};

export function parseEuControlStatus(
  value: unknown,
  nextEuControl?: unknown,
  legacyExempt?: unknown,
): EuControlStatus | null {
  // Samme fristregel som filterDependencyMet, også for eldre lagrede verdier.
  if (typeof nextEuControl === "string" && nextEuControl >= todayIsoDate()) return null;
  if (value === "missing" || value === "exempt") return value;
  return legacyExempt === true ? "exempt" : null;
}

/** EU-status SVV-oppslaget gir grunnlag for, eller `null`. Passert frist gir
 * «Mangler». «Fritatt» krever både at SVV ikke har noen kontrollfrist og en
 * fritaksregel i forskrift om periodisk kontroll av kjøretøy
 * (FOR-2009-05-13-591): § 4 andre ledd (registrert før 1960) eller § 4 første
 * ledd (tilhengere over 3 500 kg og Tempo 100-tilhengere er kontrollpliktige,
 * lettere tilhengere ikke). Uten frist og uten regel vet vi ikke hvorfor
 * fristen mangler, så vi lar feltet stå tomt. */
export function euControlStatusFromLookup(lookup: {
  next_eu_control: string | null;
  first_registration_date: string | null;
  max_total_weight_kg: number | null;
  avgiftsklasse_code: string | null;
  classification_code: string | null;
}): EuControlStatus | null {
  if (lookup.next_eu_control) return lookup.next_eu_control < todayIsoDate() ? "missing" : null;
  if (lookup.first_registration_date && lookup.first_registration_date < "1960-01-01") {
    return "exempt";
  }
  // Avgiftskode 7xx er påhengsvogn/slepvogn/semitrailer; O1/O2 er EU-klassen
  // for tilhengere opp til 3 500 kg. Tempo 100-tilhengere har kontrollfrist.
  const euClass = lookup.classification_code?.trim().toUpperCase();
  const isTrailer =
    lookup.avgiftsklasse_code?.startsWith("7") || euClass === "O1" || euClass === "O2";
  if (isTrailer && lookup.max_total_weight_kg != null && lookup.max_total_weight_kg <= 3500) {
    return "exempt";
  }
  return null;
}

/** "Hjuldrift"-alternativene brukt både i annonseopprettelse (der SVV ikke
 * kan avgjøre det automatisk) og ved redigering av publisert annonse. Kun for
 * Bil/ATV — tyngre kjøretøy (bobil/lastebil/buss) bruker
 * `getAxleConfigOptions` i stedet, se der for hvorfor. */
export const DRIVE_TYPE_OPTIONS = [
  { value: "4x4", label: "Firehjulstrekk" },
  { value: "bakhjul", label: "Bakhjulstrekk" },
  { value: "forhjul", label: "Forhjulstrekk" },
];

/** "Akselkombinasjon"-alternativene for bobil/lastebil/buss. SVV oppgir kun
 * antall akslinger (`akslinger.antallAksler`), ikke hvilke som er drivende,
 * så selgeren velger selv blant kombinasjonene som er mulige for det
 * oppgitte akseltallet — se `driveTypeFromAxles` i vehicle-lookup.server.ts
 * for hvorfor SVV-dataen ikke er nok til å avgjøre dette automatisk. */
const AXLE_CONFIG_OPTIONS_BY_AXLE_COUNT: Record<number, { value: string; label: string }[]> = {
  2: [
    { value: "4x2", label: "4x2" },
    { value: "4x4", label: "4x4" },
  ],
  3: [
    { value: "6x2", label: "6x2" },
    { value: "6x4", label: "6x4" },
    { value: "6x6", label: "6x6" },
  ],
  4: [
    { value: "8x2", label: "8x2" },
    { value: "8x4", label: "8x4" },
    { value: "8x6", label: "8x6" },
    { value: "8x8", label: "8x8" },
  ],
};

export function getAxleConfigOptions(axleCount: number | null): { value: string; label: string }[] {
  if (axleCount == null) return [];
  return AXLE_CONFIG_OPTIONS_BY_AXLE_COUNT[axleCount] ?? [];
}
