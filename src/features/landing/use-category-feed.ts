import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/components/listing-card";

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
        const rows = (data ?? []).map<ListingCardData>((l) => ({
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
        }));
        return { rows, nextOffset: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
      }

      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order), attributes",
        )
        .eq("status", "active")
        .in("category_id", categoryIds)
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        const attrs = l.attributes as Record<string, unknown> | null;
        const mileageRaw = attrs?.mileage_km;
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          subtitle: l.subtitle,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
          mileage_km: typeof mileageRaw === "number" ? mileageRaw : null,
        };
      });
      return { rows, nextOffset: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
    },
  });
}
