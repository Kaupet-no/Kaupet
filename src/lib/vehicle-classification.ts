/**
 * Maps Statens Vegvesen's EU vehicle classification code (from
 * `godkjenning.tekniskGodkjenning.kjoretoyklassifisering`, e.g. "M1"/"N1"/
 * "L3e"/"O1") to one of Kaupet's vehicle leaf category slugs. Shared between
 * client (vehicle-registration field group, to pick the next step) and
 * server (not currently used server-side, but kept slug/code-only so it can
 * be if needed).
 *
 * NB: the mapping below (in particular L5e/L6e/L7e -> atv-og-snoscooter, and
 * the M1 + bobil/campingvogn body-type heuristic) is a best-effort table and
 * has not been validated against real Statens Vegvesen payloads — see the
 * matching caveat in vehicle-lookup.server.ts. Treat low-confidence mappings
 * as a suggestion the user must confirm, not a fact.
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

/**
 * `classificationCode` is SVV's raw technical class (M1, N1, L3e, O2, ...).
 * `bodyTypeHint` is a free-text body/purpose string (from karosseri data)
 * used only to distinguish bobil/campingvogn from an ordinary M1 personbil.
 * `sleepingPlaces` (antallSoveplasser > 0) is a secondary camper signal,
 * since ordinary cars never populate it.
 */
export function classifyVehicleCategory(
  classificationCode: string | null,
  bodyTypeHint: string | null,
  sleepingPlaces: number | null,
): VehicleClassification {
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
