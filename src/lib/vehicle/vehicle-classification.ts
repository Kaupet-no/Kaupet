/**
 * Maps a vehicle to one of Kaupet's vehicle leaf category slugs. Shared
 * between client (vehicle-registration field group, to pick the next step)
 * and server (not currently used server-side, but kept slug/code-only so it
 * can be if needed).
 *
 * Primary signal is `avgiftsklasse_code` — Statens Vegvesen's Norwegian
 * "kjøretøygruppe avgift" code (`godkjenning.tekniskGodkjenning.
 * kjoretoyklassifisering.kjoretoyAvgiftsKode.kodeVerdi`, e.g. "101"
 * Personbil, "601" Moped, "630" Beltemotorsykkel — see kodeverket "AVGIFT":
 * https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/index-kodeverk.html?kodeverkId=AVGIFT).
 * It maps far more directly onto Kaupet's categories than the generic EU
 * technical class, so it's checked first; the EU code (`classificationCode`,
 * e.g. "M1"/"N1"/"L3e"/"O1") is only a fallback for the (rare) cases where
 * avgiftsklasse is missing.
 *
 * NB: neither mapping has been validated against real Statens Vegvesen
 * payloads — see the matching caveat in vehicle-lookup.server.ts. Treat
 * low-confidence mappings as a suggestion the user must confirm, not a fact.
 */

import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";

export type VehicleLeafSlug =
  | "bil"
  | "bobil"
  | "campingvogn"
  | "motorsykkel"
  | "moped-og-scooter"
  | "atv"
  | "snoscooter"
  | "tilhenger-leaf"
  | "lastebil-og-henger"
  | "buss-og-minibuss"
  | "traktor-og-redskap"
  | "anleggsmaskiner";

export type VehicleClassification = {
  slug: VehicleLeafSlug | null;
  confidence: "high" | "low";
};

/** "Bil" merger av Personbil og Varebil (kategoriene ble slått sammen — se
 * 20260722120000_bil_og_mc_category_restructure.sql); avgiftskoden er ikke
 * lenger en kategoriskillelinje, men lagres som et eget søkbart filter
 * (`avgiftskode_gruppe`) på annonsen. `avgiftskodeGruppeFromCode` under
 * utleder den gruppen fra samme kode-tabell som klassifiseringen bruker. */
export type AvgiftskodeGruppe = "personbil" | "varebil";

/** Matches "bobil"/"campingbil" (motorized) and, via the shared "camping"
 * substring, also "campingvogn"/"campingtilhenger" (towed) — used both to
 * upgrade a personbil to bobil and a tilhenger-leaf to campingvogn below. */
const CAMPER_BODY_TYPE_HINTS = ["bobil", "campingbil", "camping"];

function looksLikeCamper(bodyTypeHint: string | null): boolean {
  if (!bodyTypeHint) return false;
  const v = bodyTypeHint.toLowerCase();
  return CAMPER_BODY_TYPE_HINTS.some((hint) => v.includes(hint));
}

/** Avgiftsklasse ("kjøretøygruppe avgift") kodeVerdi -> Kaupet leaf slug.
 * Personbil- og varebil-koder mapper nå begge til "bil"; hvilken av de to
 * det faktisk var beholdes separat via `AVGIFTSKLASSE_TO_GRUPPE` for
 * `avgiftskode_gruppe`-filteret. Buss (2xx), traktor (401) og motorredskap
 * (5xx/prøvekjennemerker 8xx) har fortsatt ingen matchende leaf og faller
 * gjennom til EU-teknisk-klasse-fallback (eller null/low-confidence). */
const AVGIFTSKLASSE_TO_SLUG: Record<string, VehicleLeafSlug> = {
  "101": "bil",
  "106": "bil", // Ambulanse (personbil)
  "107": "bil", // Leilighetsambulanse (personbil)
  "312": "bil", // Begravelsesbil (personbil)
  "313": "bobil", // Campingbil (personbil) før 1.1.2009
  "316": "bobil", // Campingbil (personbil) etter 1.1.2009
  "336": "bobil", // Campingbil (lastebil) før 1.1.2009
  "301": "bil", // Kombinert bil (varebil)
  "310": "bil",
  "311": "bil",
  "314": "bil",
  "315": "bil",
  "601": "moped-og-scooter",
  "610": "motorsykkel", // Lett motorsykkel
  "620": "motorsykkel", // Tung motorsykkel
  "621": "motorsykkel", // Tung motorsykkel (chopper-ombygd)
  "630": "snoscooter", // Beltemotorsykkel (snøscooter)
  "701": "tilhenger-leaf",
  "702": "tilhenger-leaf",
  "703": "campingvogn", // Påhengsvogn (campingtilhenger)
  "709": "tilhenger-leaf",
  "711": "tilhenger-leaf",
  "712": "tilhenger-leaf",
  "713": "campingvogn", // Slepvogn (campingtilhenger)
  "719": "tilhenger-leaf",
  "721": "tilhenger-leaf",
  "722": "tilhenger-leaf",
  "723": "campingvogn", // Semitrailer (campingtilhenger)
  "729": "tilhenger-leaf",
};

/** Avgiftsklasse-koder som mapper til "bil" ovenfor, splittet i sin
 * opprinnelige Personbil/Varebil-gruppe for `avgiftskode_gruppe`-filteret. */
const AVGIFTSKLASSE_TO_GRUPPE: Record<string, AvgiftskodeGruppe> = {
  "101": "personbil",
  "106": "personbil",
  "107": "personbil",
  "312": "personbil",
  "301": "varebil",
  "310": "varebil",
  "311": "varebil",
  "314": "varebil",
  "315": "varebil",
};

/** Utleder Personbil/Varebil-gruppen fra en rå avgiftsklasse-kode, til bruk
 * i det søkbare `avgiftskode_gruppe`-feltet på "Bil"-annonser. Returnerer
 * `null` for koder som ikke havner i "bil" (bobil, MC, osv. har ikke dette
 * feltet), eller EU-teknisk-klasse-fallback der avgiftsklasse mangler. */
export function avgiftskodeGruppeFromCode(
  avgiftsklasseCode: string | null,
  classificationCode: string | null,
): AvgiftskodeGruppe | null {
  if (avgiftsklasseCode) {
    const gruppe = AVGIFTSKLASSE_TO_GRUPPE[avgiftsklasseCode.trim()];
    if (gruppe) return gruppe;
  }
  if (classificationCode) {
    const code = classificationCode.trim().toUpperCase();
    if (code === "M1") return "personbil";
    if (code === "N1") return "varebil";
  }
  return null;
}

/**
 * `avgiftsklasseCode` is SVV's Norwegian tax/vehicle-group code (see module
 * doc above) — the primary signal. `classificationCode` is SVV's raw EU
 * technical class (M1, N1, L3e, O2, ...), used only as a fallback.
 * `bodyTypeHint` is a free-text body/purpose string (from karosseri data)
 * used to distinguish bobil/campingvogn from an ordinary personbil when
 * avgiftsklasse hasn't been updated to reflect a camper conversion.
 * `sleepingPlaces` (antallSoveplasser > 0) is a secondary camper signal,
 * since ordinary cars never populate it.
 */
export function classifyVehicleCategory(
  classificationCode: string | null,
  avgiftsklasseCode: string | null,
  bodyTypeHint: string | null,
  sleepingPlaces: number | null,
): VehicleClassification {
  const avgiftsklasseSlug = avgiftsklasseCode
    ? (AVGIFTSKLASSE_TO_SLUG[avgiftsklasseCode.trim()] ?? null)
    : null;
  if (avgiftsklasseSlug) {
    if (
      avgiftsklasseSlug === "bil" &&
      (looksLikeCamper(bodyTypeHint) || (sleepingPlaces ?? 0) > 0)
    ) {
      return { slug: "bobil", confidence: "high" };
    }
    // Generic trailer avgiftsklasse codes (701/702/709/711/712/719/721/722/
    // 729) don't distinguish campingtilhenger the way 703/713/723 do — fall
    // back to the body-type hint here too, same as personbil -> bobil above.
    if (avgiftsklasseSlug === "tilhenger-leaf" && looksLikeCamper(bodyTypeHint)) {
      return { slug: "campingvogn", confidence: "high" };
    }
    return { slug: avgiftsklasseSlug, confidence: "high" };
  }

  if (!classificationCode) return { slug: null, confidence: "low" };
  const code = classificationCode.trim().toUpperCase();

  if (code === "M1") {
    if (looksLikeCamper(bodyTypeHint) || (sleepingPlaces ?? 0) > 0) {
      return { slug: "bobil", confidence: "high" };
    }
    return { slug: "bil", confidence: "high" };
  }
  if (code === "N1") return { slug: "bil", confidence: "high" };
  if (code === "L3E" || code === "L4E") return { slug: "motorsykkel", confidence: "high" };
  if (code === "L1E" || code === "L2E") return { slug: "moped-og-scooter", confidence: "high" };
  // L5e/L6e -> ATV/quad; L7e is a heavier quad that could also be a
  // beltemotorsykkel (snøscooter) — least certain mapping in this table,
  // kept as ATV since that's the more common consumer-marketplace listing.
  if (code === "L5E" || code === "L6E" || code === "L7E") {
    return { slug: "atv", confidence: "low" };
  }
  if (["O1", "O2", "O3", "O4"].includes(code)) {
    if (looksLikeCamper(bodyTypeHint)) return { slug: "campingvogn", confidence: "high" };
    return { slug: "tilhenger-leaf", confidence: "high" };
  }

  return { slug: null, confidence: "low" };
}

export const VEHICLE_LEAF_SLUGS: VehicleLeafSlug[] = [
  "bil",
  "bobil",
  "campingvogn",
  "motorsykkel",
  "moped-og-scooter",
  "atv",
  "snoscooter",
  "tilhenger-leaf",
  "lastebil-og-henger",
  "buss-og-minibuss",
  "traktor-og-redskap",
  "anleggsmaskiner",
];

/** Leaves where the "modell"-felt aldri matches mot `vehicle_models`-tabellen
 * — SVV-importert modelltekst fylles kun inn som fritekst som brukeren kan
 * redigere med en gang. Disse leddene mangler enten en `VehicleBrandGroup`
 * helt (traktor/anleggsmaskiner/lastebil-og-henger/tilhenger-leaf) eller har
 * en modelldatabase som er for upålitelig til å matche mot (MC/moped/ATV/
 * snøscooter/campingvogn). */
export const VEHICLE_LEAF_SLUGS_MODEL_FREE_TEXT: VehicleLeafSlug[] = [
  "motorsykkel",
  "moped-og-scooter",
  "campingvogn",
  "atv",
  "snoscooter",
  "tilhenger-leaf",
  "lastebil-og-henger",
  "traktor-og-redskap",
  "anleggsmaskiner",
];

/** Vehicle leaves with no odometer — the annonseopprettelse "Kilometerstand"
 * field is hidden (and not required) for these. `campingvogn` and
 * `tilhenger-leaf` are towed, not motorized; every other leaf has an engine.
 * `lastebil-og-henger` mixes both (trucks and trailers) but is left off this
 * list since trucks are the more common listing and do have an odometer. */
export const VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE: VehicleLeafSlug[] = [
  "campingvogn",
  "tilhenger-leaf",
];

/**
 * Omregistreringsavgift (re-registration fee), payable to the state on
 * ownership transfer of any previously Norwegian-registered vehicle or
 * trailer over 350 kg. Rates per Stortingets vedtak om omregistreringsavgift
 * for 2026 (https://lovdata.no/LTI/forskrift/2025-12-18-2758 §1) — a fixed
 * table by vehicle group and age, not a formula, so this needs a one-line
 * update (`OMREGISTRERINGSAVGIFT_YEAR` + the rate table) whenever a new
 * vedtak is published each December.
 *
 * Four groups (a-d in the vedtak):
 *  a) Moped/motorsykkel/beltemotorsykkel (ATV/snøscooter) — flat, all ages.
 *  b) Personbil (a "bil" listing tagged Personbil via avgiftskode_gruppe) —
 *     by egenvekt (≤1200 kg / >1200 kg).
 *  c) Varebil/kombinert/campingbil (bobil)/buss t.o.m. 7500 kg — flat.
 *  d) Biltilhenger/campingtilhenger med egenvekt over 350 kg — flat; trailers
 *     at or under 350 kg pay no fee at all (own weight is what's checked, not
 *     the max towable/lastet weight).
 */
export const OMREGISTRERINGSAVGIFT_YEAR = 2026;

type AvgiftAgeBracket = "0-3" | "4-11" | "12+";

function avgiftAgeBracket(firstRegistrationYear: number): AvgiftAgeBracket {
  const age = OMREGISTRERINGSAVGIFT_YEAR - firstRegistrationYear;
  if (age <= 3) return "0-3";
  if (age <= 11) return "4-11";
  return "12+";
}

const GROUP_A_LEAFS: VehicleLeafSlug[] = ["motorsykkel", "moped-og-scooter", "atv", "snoscooter"];
const GROUP_C_LEAFS: VehicleLeafSlug[] = ["bobil"];
const GROUP_D_LEAFS: VehicleLeafSlug[] = ["campingvogn", "tilhenger-leaf"];

const GROUP_A_RATE_NOK = 645;
const GROUP_B_RATE_NOK: Record<"le1200" | "gt1200", Record<AvgiftAgeBracket, number>> = {
  le1200: { "0-3": 4918, "4-11": 3236, "12+": 1942 },
  gt1200: { "0-3": 7505, "4-11": 4532, "12+": 1942 },
};
const GROUP_C_RATE_NOK: Record<AvgiftAgeBracket, number> = {
  "0-3": 2459,
  "4-11": 1553,
  "12+": 1296,
};
const GROUP_D_RATE_NOK = 645;
const GROUP_D_WEIGHT_THRESHOLD_KG = 350;

/**
 * Computes the omregistreringsavgift for a vehicle in NOK, or `null` when the
 * leaf isn't subject to the fee at all (incl. group d at/under the 350 kg
 * threshold — genuinely exempt, not "unknown"), or when required data
 * (weight for personbil/tilhenger, first-registration year) is missing.
 * For `leafSlug === "bil"`, `avgiftskodeGruppe` distinguishes the personbil
 * (group b, weight-based) from the varebil (group c, flat) rate — required
 * whenever `leafSlug` is "bil" since the fee differs meaningfully between
 * the two; omitting it returns `null` rather than guessing.
 * Callers should fall back to linking Skatteetatens kalkulator on `null`
 * rather than guessing.
 */
export function computeOmregistreringsavgift(
  leafSlug: VehicleLeafSlug | null,
  weightKg: number | null,
  firstRegistrationYear: number | null,
  avgiftskodeGruppe?: AvgiftskodeGruppe | null,
): number | null {
  if (!leafSlug || firstRegistrationYear == null) return null;

  if (GROUP_A_LEAFS.includes(leafSlug)) return GROUP_A_RATE_NOK;

  const bracket = avgiftAgeBracket(firstRegistrationYear);

  if (leafSlug === "bil") {
    if (avgiftskodeGruppe === "varebil") return GROUP_C_RATE_NOK[bracket];
    if (avgiftskodeGruppe === "personbil") {
      if (weightKg == null) return null;
      return GROUP_B_RATE_NOK[weightKg <= 1200 ? "le1200" : "gt1200"][bracket];
    }
    return null;
  }

  if (GROUP_C_LEAFS.includes(leafSlug)) return GROUP_C_RATE_NOK[bracket];

  if (GROUP_D_LEAFS.includes(leafSlug)) {
    if (weightKg == null) return null;
    if (weightKg <= GROUP_D_WEIGHT_THRESHOLD_KG) return null;
    return GROUP_D_RATE_NOK;
  }

  return null;
}

/**
 * Price shown on a listing card/search result must include the
 * omregistreringsavgift the buyer pays on top for a vehicle listing — same
 * total the listing detail page shows. Reads the seller's override/fritatt/
 * inkludert flags and the SVV lookup snapshot straight out of `attributes`,
 * so callers only need `price_nok`, the listing's leaf category slug, and
 * the raw `attributes` blob. Returns `null` for non-vehicle listings or a
 * missing price — callers should fall back to `price_nok` in that case.
 */
export function computeListingTotalPriceKr(
  leafSlug: string | null | undefined,
  priceNok: number | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): number | null {
  if (!leafSlug || !VEHICLE_LEAF_SLUGS.includes(leafSlug as VehicleLeafSlug)) return null;
  if (priceNok == null) return null;

  if (attributes?.omregistreringsavgift_fritatt === true) return priceNok;
  if (attributes?.omregistreringsavgift_inkludert === true) return priceNok;

  const overrideRaw = attributes?.omregistreringsavgift_override_kr;
  const vehicleLookup = parseVehicleLookup(attributes?.vehicle_lookup);
  const avgiftKr =
    typeof overrideRaw === "number"
      ? overrideRaw
      : computeOmregistreringsavgift(
          leafSlug as VehicleLeafSlug,
          vehicleLookup?.weight_kg ?? null,
          firstRegistrationYear(vehicleLookup?.first_registration_date),
          (attributes?.avgiftskode_gruppe as AvgiftskodeGruppe | undefined) ?? null,
        );

  return priceNok + (avgiftKr ?? 0);
}
