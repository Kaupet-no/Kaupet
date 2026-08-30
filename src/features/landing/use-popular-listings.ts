import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/components/listing-card";

/**
 * "Populært akkurat nå" carousel data — most-viewed listings in the last
 * week. `limit` is part of the query key: AppLanding (native) and
 * WebLanding previously shared one `["popular-listings-last-week"]` cache
 * entry while requesting different row counts (10 vs 8), so whichever
 * request resolved first silently capped the other at its own limit.
 */
export function usePopularListings(limit = 8) {
  const {
    data: popular,
    isError: popularIsError,
    refetch: refetchPopular,
  } = useQuery({
    queryKey: ["popular-listings-last-week", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("popular_listings_last_week", {
        _limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => ({
        id: l.listing_id,
        kaupet_code: l.kaupet_code,
        title: l.title,
        subtitle: l.subtitle,
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

  // Ikke reell popularitet før minst én annonse faktisk har blitt sett i
  // løpet av uken — helt i starten (eller ved lavt volum) vil listen bare
  // være nyeste-først (RPC-ens egen NULLS LAST-fallback), og da skal
  // overskriften si "Nye annonser", ikke late som noe er "populært".
  const hasPopularitySignal = (popular ?? []).some((l) => (l.views_last_week ?? 0) > 0);

  return { popular, popularIsError, refetchPopular, hasPopularitySignal };
}
