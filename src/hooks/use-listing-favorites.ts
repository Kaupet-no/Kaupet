import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const EMPTY_FAVORITES = new Set<string>();

/** Loads favorite state for a result set in one request instead of letting
 * every card issue its own query. Standalone cards keep their local fallback. */
export function useListingFavorites(listingIds: string[]) {
  const { user } = useAuth();
  const stableIds = [...new Set(listingIds)].sort();

  const query = useQuery({
    queryKey: ["listing-favorites", user?.id, stableIds],
    enabled: !!user && stableIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("listing_id")
        .eq("user_id", user!.id)
        .in("listing_id", stableIds);
      if (error) throw error;
      return new Set(data.map((favorite) => favorite.listing_id));
    },
    staleTime: 30_000,
  });

  return {
    favoriteIds: query.data ?? EMPTY_FAVORITES,
    isReady: !user || stableIds.length === 0 || query.isFetched,
  };
}
