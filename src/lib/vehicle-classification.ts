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
 * avgiftsklasse is missing or falls in a group Kaupet doesn't sell (buss,
 * lastebil, traktor, motorredskap, prøvekjennemerker).
 *
 * NB: neither mapping has been validated against real Statens Vegvesen
 * payloads — see the matching caveat in vehicle-lookup.server.ts. Treat
 * low-confidence mappings as a suggestion the user must confirm, not a fact.
 */

export type VehicleLeafSlug =
  | "personbil"
  | "varebil"
  | "bobil"
  | "campingvogn"
  | "motorsykkel"
  | "moped-og-scooter"
  | "atv-og-snoscooter"
  | "tilhenger-leaf";

export type VehicleClassification = {
  slug: VehicleLeafSlug | null;
  confidence: "high" | "low";
};

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
 * Only codes that map cleanly onto a Kaupet category are listed; buss
 * (2xx), lastebil/trekkbil/beltebil/tankbil/bergingsbil (most of 3xx),
 * traktor (401), motorredskap (5xx) and prøvekjennemerker (8xx) have no
 * matching leaf and are intentionally omitted, falling through to the EU
 * technical-class fallback (or null/low-confidence if that's also absent). */
const AVGIFTSKLASSE_TO_SLUG: Record<string, VehicleLeafSlug> = {
  "101": "personbil",
  "106": "personbil", // Ambulanse (personbil)
  "107": "personbil", // Leilighetsambulanse (personbil)
  "312": "personbil", // Begravelsesbil (personbil)
  "313": "bobil", // Campingbil (personbil) før 1.1.2009
  "316": "bobil", // Campingbil (personbil) etter 1.1.2009
  "336": "bobil", // Campingbil (lastebil) før 1.1.2009
  "301": "varebil", // Kombinert bil
  "310": "varebil",
  "311": "varebil",
  "314": "varebil",
  "315": "varebil",
  "601": "moped-og-scooter",
  "610": "motorsykkel", // Lett motorsykkel
  "620": "motorsykkel", // Tung motorsykkel
  "621": "motorsykkel", // Tung motorsykkel (chopper-ombygd)
  "630": "atv-og-snoscooter", // Beltemotorsykkel (snøscooter)
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
      avgiftsklasseSlug === "personbil" &&
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
    return { slug: "personbil", confidence: "high" };
  }
  if (code === "N1") return { slug: "varebil", confidence: "high" };
  if (code === "L3E" || code === "L4E") return { slug: "motorsykkel", confidence: "high" };
  if (code === "L1E" || code === "L2E") return { slug: "moped-og-scooter", confidence: "high" };
  // L5e/L6e/L7e -> ATV/snøscooter-ish quads: least certain mapping in this
  // table, may also cover light utility vehicles that don't fit a consumer
  // marketplace "ATV" listing well.
  if (code === "L5E" || code === "L6E" || code === "L7E") {
    return { slug: "atv-og-snoscooter", confidence: "low" };
  }
  if (["O1", "O2", "O3", "O4"].includes(code)) {
    if (looksLikeCamper(bodyTypeHint)) return { slug: "campingvogn", confidence: "high" };
    return { slug: "tilhenger-leaf", confidence: "high" };
  }

  return { slug: null, confidence: "low" };
}

export const VEHICLE_LEAF_SLUGS: VehicleLeafSlug[] = [
  "personbil",
  "varebil",
  "bobil",
  "campingvogn",
  "motorsykkel",
  "moped-og-scooter",
  "atv-og-snoscooter",
  "tilhenger-leaf",
];

/** Vehicle leaves with no odometer — the annonseopprettelse "Kilometerstand"
 * field is hidden (and not required) for these. `campingvogn` and
 * `tilhenger-leaf` are towed, not motorized; every other leaf has an engine. */
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
 *  b) Personbil — by egenvekt (≤1200 kg / >1200 kg).
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

const GROUP_A_LEAFS: VehicleLeafSlug[] = ["motorsykkel", "moped-og-scooter", "atv-og-snoscooter"];
const GROUP_C_LEAFS: VehicleLeafSlug[] = ["varebil", "bobil"];
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
 * Callers should fall back to linking Skatteetatens kalkulator on `null`
 * rather than guessing.
 */
export function computeOmregistreringsavgift(
  leafSlug: VehicleLeafSlug | null,
  weightKg: number | null,
  firstRegistrationYear: number | null,
): number | null {
  if (!leafSlug || firstRegistrationYear == null) return null;

  if (GROUP_A_LEAFS.includes(leafSlug)) return GROUP_A_RATE_NOK;

  const bracket = avgiftAgeBracket(firstRegistrationYear);

  if (leafSlug === "personbil") {
    if (weightKg == null) return null;
    return GROUP_B_RATE_NOK[weightKg <= 1200 ? "le1200" : "gt1200"][bracket];
  }

  if (GROUP_C_LEAFS.includes(leafSlug)) return GROUP_C_RATE_NOK[bracket];

  if (GROUP_D_LEAFS.includes(leafSlug)) {
    if (weightKg == null) return null;
    if (weightKg <= GROUP_D_WEIGHT_THRESHOLD_KG) return null;
    return GROUP_D_RATE_NOK;
  }

  return null;
}
