import { computeListingTotalPriceKr } from "@/lib/vehicle/vehicle-classification";

type ListingPriceData = {
  price_nok: number | null;
  is_free: boolean;
  category_slug?: string | null;
  attributes?: Record<string, unknown> | null;
};

export function formatPrice(p: { price_nok: number | null; is_free: boolean }) {
  if (p.is_free) return "Gis bort";
  if (p.price_nok == null) return "Pris ved henvendelse";
  return `${p.price_nok.toLocaleString("nb-NO")} kr`;
}

/** Vehicle listing cards show the price including omregistreringsavgift —
 * same total as the listing detail page — not just what the seller set. */
export function displayPriceNok(
  listing: Pick<ListingPriceData, "category_slug" | "price_nok" | "attributes">,
): number | null {
  return (
    computeListingTotalPriceKr(listing.category_slug, listing.price_nok, listing.attributes) ??
    listing.price_nok
  );
}
