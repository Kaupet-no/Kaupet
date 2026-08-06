import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/components/listing-card";

/** "Populært akkurat nå" carousel data — most-viewed listings in the last week. */
export function usePopularListings() {
  const {
    data: popular,
    isError: popularIsError,
    refetch: refetchPopular,
  } = useQuery({
    queryKey: ["popular-listings-last-week"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("popular_listings_last_week", { _limit: 8 });
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => ({
        id: l.listing_id,
        kaupet_code: l.kaupet_code,
        title: l.title,
        price_nok: l.price_nok,
        is_free: l.is_free,
        city: l.city,
        created_at: l.created_at,
        cover_path: l.cover_path,
        total_views: Number(l.total_views ?? 0),
        views_last_week: Number(l.views_last_week ?? 0),
        mileage_km: l.mileage_km != null ? Number(l.mileage_km) : null,
        category_slug: l.category_slug,
        attributes: l.attributes as Record<string, unknown> | null,
      }));
    },
  });

  return { popular, popularIsError, refetchPopular };
}
