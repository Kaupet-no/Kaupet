import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toPopularListingCardData } from "@/lib/listing-card-data";

/**
 * "Populært akkurat nå" carousel data — most-viewed listings in the last
 * week. `limit` is part of the query key: AppLanding (native) and
 * WebLanding previously shared one `["popular-listings-last-week"]` cache
 * entry while requesting different row counts (10 vs 8), so whichever
 * request resolved first silently capped the other at its own limit.
 *
 * `enabled` lar kallestedet utsette selve hentingen: native-forsiden skal være
 * rolig ved appstart og henter først når brukeren faktisk scroller (se
 * AppLanding), mens web-forsiden henter som før.
 */
export function usePopularListings(limit = 8, enabled = true) {
  const {
    data: popular,
    isError: popularIsError,
    refetch: refetchPopular,
  } = useQuery({
    queryKey: ["popular-listings-last-week", limit],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("popular_listings_last_week", {
        _limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map(toPopularListingCardData);
    },
  });

  // Ikke reell popularitet før minst én annonse faktisk har blitt sett i
  // løpet av uken — helt i starten (eller ved lavt volum) vil listen bare
  // være nyeste-først (RPC-ens egen NULLS LAST-fallback), og da skal
  // overskriften si "Nye annonser", ikke late som noe er "populært".
  const hasPopularitySignal = (popular ?? []).some((l) => (l.views_last_week ?? 0) > 0);

  return { popular, popularIsError, refetchPopular, hasPopularitySignal };
}
