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
  | "bobil-og-campingvogn"
  | "motorsykkel"
  | "moped-og-scooter"
  | "atv-og-snoscooter"
  | "tilhenger-leaf";

export type VehicleClassification = {
  slug: VehicleLeafSlug | null;
  confidence: "high" | "low";
};

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
  "313": "bobil-og-campingvogn", // Campingbil (personbil) før 1.1.2009
  "316": "bobil-og-campingvogn", // Campingbil (personbil) etter 1.1.2009
  "336": "bobil-og-campingvogn", // Campingbil (lastebil) før 1.1.2009
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
  "703": "tilhenger-leaf",
  "709": "tilhenger-leaf",
  "711": "tilhenger-leaf",
  "712": "tilhenger-leaf",
  "713": "tilhenger-leaf",
  "719": "tilhenger-leaf",
  "721": "tilhenger-leaf",
  "722": "tilhenger-leaf",
  "723": "tilhenger-leaf",
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
      return { slug: "bobil-og-campingvogn", confidence: "high" };
    }
    return { slug: avgiftsklasseSlug, confidence: "high" };
  }

  if (!classificationCode) return { slug: null, confidence: "low" };
  const code = classificationCode.trim().toUpperCase();

  if (code === "M1") {
    if (looksLikeCamper(bodyTypeHint) || (sleepingPlaces ?? 0) > 0) {
      return { slug: "bobil-og-campingvogn", confidence: "high" };
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
    return { slug: "tilhenger-leaf", confidence: "high" };
  }

  return { slug: null, confidence: "low" };
}

export const VEHICLE_LEAF_SLUGS: VehicleLeafSlug[] = [
  "personbil",
  "varebil",
  "bobil-og-campingvogn",
  "motorsykkel",
  "moped-og-scooter",
  "atv-og-snoscooter",
  "tilhenger-leaf",
];
