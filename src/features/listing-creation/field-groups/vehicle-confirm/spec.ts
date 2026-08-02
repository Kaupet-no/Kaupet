import { isValid, parse } from "date-fns";

import {
  avgiftskodeGruppeFromCode,
  type AvgiftskodeGruppe,
} from "@/lib/vehicle/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.server";

/** SVV returns color as free text (e.g. "SORT", "SØLV METALLIC") — best-effort
 * maps it onto the fixed color list as a preselected suggestion the user can
 * correct via the dropdown, rather than leaving the field empty or storing
 * raw text that wouldn't match the "manual entry" path's fixed values. */
export function guessColorOption(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.toLowerCase();
  const matchers: [string, string[]][] = [
    ["black", ["sort", "svart"]],
    ["white", ["hvit"]],
    ["silver", ["sølv", "solv"]],
    ["gray", ["grå", "gra"]],
    ["red", ["rød", "rod"]],
    ["blue", ["blå", "bla"]],
    ["green", ["grønn", "gronn"]],
    ["yellow", ["gul"]],
    ["orange", ["oransje"]],
    ["brown", ["brun"]],
    ["beige", ["beige"]],
    ["purple", ["lilla", "fiolett"]],
  ];
  for (const [value, keywords] of matchers) {
    if (keywords.some((k) => s.includes(k))) return value;
  }
  return "other";
}

/** `next_eu_control` is stored/submitted as an ISO date (`yyyy-MM-dd`) —
 * matching the format SVV's `kontrollfrist` already comes in as — but shown
 * to the user as a calendar-picked `dd.MM.yyyy`, same field used by every
 * vehicle leaf (not a trailer-specific control). */
export function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The subset of vehicle-confirm's fields that are also `category_filters`
 * for vehicle leaves — editable here so they're never asked again in the
 * later category-attributes step (see VEHICLE_LOOKUP_FILTER_KEYS). */
export type EditableSpec = {
  year: string;
  fuel_type: string;
  transmission: string;
  drive_type: string;
  weight_kg: string;
  /** Tillatt totalvekt — kun relevant for bil/bobil/campingvogn/tilhenger/de
   * tyngre kjøretøykategoriene (se `showWeightAndLength` under). */
  max_total_weight_kg: string;
  /** Lengde i meter — samme kategorier som over. */
  length_m: string;
  power_hk: string;
  tow_hitch: boolean;
  max_tow_weight_kg: string;
  seats: string;
  color: string;
  next_eu_control: string;
  eu_control_exempt: boolean | null;
  /** Antall soveplasser — kun relevant for bobil/campingvogn (se `isCamper`
   * under). Statens vegvesens Enkeltoppslag-API har ikke dette feltet i det
   * hele tatt (verifisert mot det reelle OpenAPI-skjemaet), så `lookup.
   * sleeping_places` er alltid `null` — dette er derfor et rent manuelt felt,
   * ikke en SVV-verdi brukeren kan korrigere. */
  sleeping_places: string;
  imported_used: boolean | null;
  first_registration_date: string;
  cylinders: string;
  engine_displacement_cc: string;
  engine_code: string;
  /** Personbil/Varebil, utledet automatisk fra avgiftsklassekoden (se
   * avgiftskodeGruppeFromCode) — kun relevant når kjøretøyet er klassifisert
   * som "bil". Ikke et redigerbart felt (vises kun som informasjon), men
   * lagres i attributes.avgiftskode_gruppe slik at det blir søkbart. */
  avgiftskode_gruppe: AvgiftskodeGruppe | null;
};

export function specFromLookup(lookup: VehicleLookupResult | null): EditableSpec {
  return {
    year: lookup?.year != null ? String(lookup.year) : "",
    fuel_type: lookup?.fuel_type ?? "",
    transmission: lookup?.transmission ?? "",
    drive_type: lookup?.drive_type ?? "",
    weight_kg: lookup?.weight_kg != null ? String(lookup.weight_kg) : "",
    max_total_weight_kg:
      lookup?.max_total_weight_kg != null ? String(lookup.max_total_weight_kg) : "",
    length_m: lookup?.length_m != null ? String(lookup.length_m) : "",
    power_hk: lookup?.power_hk != null ? String(lookup.power_hk) : "",
    tow_hitch: lookup?.tow_hitch ?? false,
    max_tow_weight_kg: lookup?.max_tow_weight_kg != null ? String(lookup.max_tow_weight_kg) : "",
    seats: lookup?.seats != null ? String(lookup.seats) : "",
    color: guessColorOption(lookup?.color),
    next_eu_control: lookup?.next_eu_control ?? "",
    // Statens vegvesen-oppslaget inneholder ikke pålitelig informasjon om
    // Tempo 100-registrering, så dette kan aldri utledes automatisk — brukeren
    // må alltid svare eksplisitt (se spørsmålet under datakortet i UI-en).
    eu_control_exempt: null,
    sleeping_places: lookup?.sleeping_places != null ? String(lookup.sleeping_places) : "",
    imported_used: lookup?.imported_used ?? null,
    first_registration_date: lookup?.first_registration_date ?? "",
    cylinders: lookup?.cylinders != null ? String(lookup.cylinders) : "",
    engine_displacement_cc:
      lookup?.engine_displacement_cc != null ? String(lookup.engine_displacement_cc) : "",
    engine_code: lookup?.engine_code ?? "",
    avgiftskode_gruppe: avgiftskodeGruppeFromCode(
      lookup?.avgiftsklasse_code ?? null,
      lookup?.classification_code ?? null,
    ),
  };
}

export function specOverridesFrom(spec: EditableSpec) {
  return {
    year: spec.year.trim() ? Number(spec.year) : undefined,
    fuel_type: spec.fuel_type || undefined,
    transmission: spec.transmission || undefined,
    drive_type: spec.drive_type || undefined,
    weight_kg: spec.weight_kg.trim() ? Number(spec.weight_kg) : undefined,
    max_total_weight_kg: spec.max_total_weight_kg.trim()
      ? Number(spec.max_total_weight_kg)
      : undefined,
    length_m: spec.length_m.trim() ? Number(spec.length_m) : undefined,
    power_hk: spec.power_hk.trim() ? Number(spec.power_hk) : undefined,
    tow_hitch: spec.tow_hitch,
    max_tow_weight_kg: spec.max_tow_weight_kg.trim() ? Number(spec.max_tow_weight_kg) : undefined,
    seats: spec.seats.trim() ? Number(spec.seats) : undefined,
    color: spec.color || undefined,
    next_eu_control: spec.next_eu_control || undefined,
    eu_control_exempt: spec.eu_control_exempt ?? undefined,
    sleeping_places: spec.sleeping_places.trim() ? Number(spec.sleeping_places) : undefined,
    imported_used: spec.imported_used ?? undefined,
    first_registration_date: spec.first_registration_date || undefined,
    cylinders: spec.cylinders.trim() ? Number(spec.cylinders) : undefined,
    engine_displacement_cc: spec.engine_displacement_cc.trim()
      ? Number(spec.engine_displacement_cc)
      : undefined,
    engine_code: spec.engine_code || undefined,
    avgiftskode_gruppe: spec.avgiftskode_gruppe ?? undefined,
  };
}
