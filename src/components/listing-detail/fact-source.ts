export type FactSource = "registry" | "seller" | "kaupet" | "unknown";

export type ListingFactSource = {
  source: FactSource;
  timestamp: string | null;
};

const FACT_SOURCES: Record<string, FactSource> = {
  vehicleLookup: "registry",
  profileAge: "kaupet",
  reviews: "kaupet",
  sellerFields: "seller",
};

/** Local presentation mapping for facts already loaded by the detail route.
 * Review summaries are managed/calculated by Kaupet; listing fields remain
 * seller claims. Only profile age currently has a source timestamp in that flow. */
export function mapListingFactSource(
  fact: string,
  existingTimestamp: string | null = null,
): ListingFactSource {
  return {
    source: FACT_SOURCES[fact] ?? "unknown",
    timestamp: fact === "profileAge" ? existingTimestamp : null,
  };
}
