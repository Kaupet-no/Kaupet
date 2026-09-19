import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { displayPriceNok } from "@/lib/format";

export type ListingPreviewData = {
  title: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  cover_path: string | null;
  kaupet_code: string | null;
};

/**
 * Shared "small preview card" data for a listing by id — used by the promote
 * and just-published dialogs, which show the same title/price/city/cover
 * summary right after a listing action. Also resolves the cover path to a
 * signed URL, the same effect both dialogs previously duplicated.
 */
export function useListingPreview(listingId: string, enabled: boolean) {
  const { data: listing } = useQuery({
    queryKey: ["listing-preview", listingId],
    enabled,
    queryFn: async (): Promise<ListingPreviewData | null> => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "title, price_nok, is_free, city, kaupet_code, attributes, categories(slug), listing_images(storage_path, sort_order)",
        )
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const cover =
        (data.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.storage_path ?? null;
      const category = Array.isArray(data.categories) ? data.categories[0] : data.categories;
      return {
        title: data.title,
        // Same total the ad, search cards and message list show — not the
        // seller's bare price_nok (F4: raw price_nok leaks omregistrerings-
        // avgift-free numbers into "just published"/"promote" previews).
        price_nok: displayPriceNok({
          category_slug: category?.slug ?? null,
          price_nok: data.price_nok,
          attributes: (data.attributes ?? null) as Record<string, unknown> | null,
        }),
        is_free: data.is_free,
        city: data.city,
        cover_path: cover,
        kaupet_code: data.kaupet_code,
      };
    },
  });

  const imgUrl = listing?.cover_path
    ? signListingImageUrls([listing.cover_path])[listing.cover_path]
    : null;

  return { listing, imgUrl };
}
