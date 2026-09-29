import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/lib/listing-card-data";
import { toListingCardData, toPopularListingCardData } from "@/lib/listing-card-data";

const PAGE_SIZE = 12;

export type CategoryFeedSort = "popular" | "new";

type CategoryFeedPage = { rows: ListingCardData[]; nextOffset: number | null };

type UseCategoryFeedArgs = {
  categoryIds: string[];
  sort: CategoryFeedSort;
};

/** Exhaustive, paginated feed of listings for the category the user selected
 * on the landing page — "popular" (last 7 days) via the same view-count metric
 * as the top carousel, or "new" via a plain created_at ordering. */
export function useCategoryFeed({ categoryIds, sort }: UseCategoryFeedArgs) {
  return useInfiniteQuery({
    queryKey: ["category-feed", categoryIds, sort],
    enabled: categoryIds.length > 0,
    initialPageParam: 0,
    getNextPageParam: (lastPage: CategoryFeedPage) => lastPage.nextOffset ?? undefined,
    queryFn: async ({ pageParam }): Promise<CategoryFeedPage> => {
      if (sort === "popular") {
        const { data, error } = await supabase.rpc("popular_listings_by_category", {
          _category_ids: categoryIds,
          _limit: PAGE_SIZE,
          _offset: pageParam,
        });
        if (error) throw error;
        const rows = (data ?? []).map(toPopularListingCardData);
        return { rows, nextOffset: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
      }

      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order), attributes, categories(slug)",
        )
        .eq("status", "active")
        .in("category_id", categoryIds)
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data ?? []).map(toListingCardData);
      return { rows, nextOffset: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
    },
  });
}
