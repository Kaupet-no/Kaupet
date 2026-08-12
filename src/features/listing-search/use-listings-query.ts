import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Category } from "@/lib/categories";
import { logSearchQueryEvent } from "@/lib/search-logging.functions";
import type { ListingsPage } from "@/features/listing-search/search-schema";
import {
  buildListingsSearchRpcArgs,
  runListingsSearch,
  type ListingsSearchParams,
} from "@/features/listing-search/listing-search-query";

const PAGE_SIZE = 20;

type UseListingsQueryArgs = {
  search: ListingsSearchParams;
  categories: Pick<Category, "id" | "slug" | "parent_id">[] | undefined;
  effectiveCategories: string[];
  terms: string[];
};

/**
 * Encapsulates the /annonser listings search: the infinite-scroll Supabase
 * query and all text/category/radius/attribute filters. The database RPC
 * applies the filters and pagination together, so the browser only receives
 * one result page rather than transporting large intermediate ID lists.
 */
export function useListingsQuery({
  search,
  categories,
  effectiveCategories,
  terms,
}: UseListingsQueryArgs) {
  const logSearchQuery = useServerFn(logSearchQueryEvent);

  return useInfiniteQuery({
    queryKey: ["listings", search, effectiveCategories, terms],
    // Uten dette blankes `totalCount`/listen momentant ved hvert filterbytte
    // (attrs/pris/tilstand går rett til URL, så hvert trykk er en ny
    // queryKey) — søkepanelets "Vis X treff" ville da blinket tomt mens nytt
    // svar hentes i stedet for å oppdateres live. Behold forrige svar til
    // det nye er klart.
    placeholderData: keepPreviousData,
    enabled: effectiveCategories.length === 0 || !!categories,
    initialPageParam: 0,
    getNextPageParam: (lastPage: ListingsPage) => lastPage.nextOffset ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<ListingsPage> => {
      const emptyPage: ListingsPage = { rows: [], totalCount: 0, nextOffset: null };

      // Aggregated, fire-and-forget logging of the free-text query and its
      // result count — only for the first page of a real text search, so
      // future tuning (trigram threshold, synonyms) has data to work from.
      const rawQuery = (search.q ?? "").trim();
      const logSearch = (resultCount: number) => {
        if (pageParam === 0 && rawQuery) {
          void logSearchQuery({ data: { query: rawQuery, resultCount } });
        }
      };

      const args = buildListingsSearchRpcArgs({
        search,
        categories,
        effectiveCategories,
        terms,
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      if (!args) return emptyPage;
      const data = await runListingsSearch(args, signal);

      const raw = data ?? [];
      const totalCount = raw[0]?.total_count ?? 0;
      const rows = raw.map((l) => {
        const attrs = l.attributes as Record<string, unknown> | null;
        const mileageRaw = attrs?.mileage_km;
        const engineHoursRaw = attrs?.engine_hours;
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          subtitle: l.subtitle,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          lat: l.display_lat as number | null,
          lng: l.display_lng as number | null,
          created_at: l.created_at,
          cover_path: l.cover_path,
          mileage_km: typeof mileageRaw === "number" ? mileageRaw : null,
          engine_hours: typeof engineHoursRaw === "number" ? engineHoursRaw : null,
          category_slug: l.category_slug,
          attributes: attrs,
        };
      });
      logSearch(totalCount);
      return {
        rows,
        totalCount,
        nextOffset: pageParam + rows.length < totalCount ? pageParam + PAGE_SIZE : null,
      };
    },
  });
}
