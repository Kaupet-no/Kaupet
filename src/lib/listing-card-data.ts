import type { ListingCardData } from "@/components/listing-card";

/** Shape returned by a Supabase `listings` select with the standard
 * `listing_images(storage_path, sort_order), attributes, categories(slug)`
 * join — the raw row `toListingCardData` maps into a `ListingCardData`. */
export type RawListingCardRow = {
  id: string;
  kaupet_code: string;
  title: string;
  subtitle: string | null;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  created_at: string;
  listing_images: { storage_path: string; sort_order: number }[] | null;
  attributes: unknown;
  categories: { slug: string } | { slug: string }[] | null;
};

/**
 * Maps a raw `listings` row (with the standard listing_images/attributes/
 * categories join) to `ListingCardData` — picks the lowest-sort_order image
 * as the cover, pulls `mileage_km` out of the free-form `attributes` JSON,
 * and unwraps the `categories` relation (Supabase returns it as an array or
 * a single object depending on the join). Shared by every screen that reads
 * listings straight from the table rather than through a search/RPC path
 * that already returns `ListingCardData`-shaped rows.
 */
export function toListingCardData(row: RawListingCardRow): ListingCardData {
  const imgs = (row.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const attrs = row.attributes as Record<string, unknown> | null;
  const mileageRaw = attrs?.mileage_km;
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    kaupet_code: row.kaupet_code,
    title: row.title,
    subtitle: row.subtitle,
    price_nok: row.price_nok,
    is_free: row.is_free,
    city: row.city,
    created_at: row.created_at,
    cover_path: imgs[0]?.storage_path ?? null,
    mileage_km: typeof mileageRaw === "number" ? mileageRaw : null,
    category_slug: category?.slug ?? null,
    attributes: attrs,
  };
}
