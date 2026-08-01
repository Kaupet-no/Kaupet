import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Category } from "@/lib/categories";
import { applyAttributeFilters } from "@/lib/category-filters";
import {
  decodeAttrFilters,
  searchSchema,
  type ListingsPage,
} from "@/features/listing-search/search-schema";

const PAGE_SIZE = 20;

type SelectedListingRow = {
  id: string;
  kaupet_code: string;
  title: string;
  subtitle: string | null;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  display_lat: number | null;
  display_lng: number | null;
  created_at: string;
  listing_images: { storage_path: string; sort_order: number }[] | null;
  attributes: Json;
};

type SearchParams = z.infer<typeof searchSchema>;

type UseListingsQueryArgs = {
  search: SearchParams;
  categories: Pick<Category, "id" | "slug" | "parent_id">[] | undefined;
  effectiveCategories: string[];
  terms: string[];
  radiusIds: string[] | undefined;
};

/**
 * Encapsulates the /annonser listings search: the infinite-scroll Supabase
 * query, category/price/condition filters, and — when there's a text query
 * or extra search lines — the `search_listing_ids` RPC, which resolves
 * matching ids and relevance rank against `listings.search_vector` (a
 * Postgres full-text index) instead of ILIKE scans.
 */
export function useListingsQuery({
  search,
  categories,
  effectiveCategories,
  terms,
  radiusIds,
}: UseListingsQueryArgs) {
  return useInfiniteQuery({
    queryKey: ["listings", search, radiusIds, effectiveCategories, terms],
    enabled:
      (effectiveCategories.length === 0 || !!categories) &&
      (search.lat == null || search.lng == null || radiusIds != null),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ListingsPage) => lastPage.nextOffset ?? undefined,
    queryFn: async ({ pageParam }): Promise<ListingsPage> => {
      const extraGroups = search.extraGroups ?? [];
      const includeGroups = [
        { mode: search.qMode ?? "all", terms },
        ...extraGroups.filter((g) => !g.exclude),
      ].filter((g) => g.terms.length > 0);
      const excludeAnyTerms = extraGroups
        .filter((g) => g.exclude && g.mode === "any")
        .flatMap((g) => g.terms);
      const excludeAllGroups = extraGroups
        .filter((g) => g.exclude && g.mode === "all")
        .map((g) => g.terms)
        .filter((terms) => terms.length > 0);
      const hasSearch =
        includeGroups.length > 0 || excludeAnyTerms.length > 0 || excludeAllGroups.length > 0;
      const emptyPage: ListingsPage = { rows: [], totalCount: 0, nextOffset: null };

      // Aggregated, fire-and-forget logging of the free-text query and its
      // result count — only for the first page of a real text search, so
      // future tuning (trigram threshold, synonyms) has data to work from.
      const rawQuery = (search.q ?? "").trim();
      const logSearch = (resultCount: number) => {
        if (pageParam === 0 && rawQuery) {
          void supabase.rpc("log_search_query", { _query: rawQuery, _result_count: resultCount });
        }
      };

      // Rank of matching ids, keyed by id — used to sort by relevance and to
      // constrain the main query to matching rows. Resolved server-side via
      // the listings.search_vector GIN index instead of ILIKE scans.
      let searchRank: Map<string, number> | null = null;
      if (hasSearch) {
        const { data: matches, error: searchError } = await supabase.rpc("search_listing_ids", {
          include_groups: includeGroups,
          exclude_any_terms: excludeAnyTerms.length > 0 ? excludeAnyTerms : null,
          exclude_all_groups: excludeAllGroups,
        });
        if (searchError) throw searchError;
        if (!matches || matches.length === 0) {
          logSearch(0);
          return emptyPage;
        }
        searchRank = new Map(matches.map((m) => [m.id, m.rank]));
      }

      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, description, price_nok, is_free, city, display_lat, display_lng, created_at, listing_images(storage_path, sort_order), attributes",
          { count: pageParam === 0 ? "exact" : undefined },
        )
        .eq("status", "active");

      if (searchRank) qb = qb.in("id", Array.from(searchRank.keys()));

      if (search.lat != null && search.lng != null) {
        const ids = radiusIds ?? [];
        if (ids.length === 0) return emptyPage;
        qb = qb.in("id", ids);
      }

      // Categories — single selection; if a parent is chosen, include all children
      if (effectiveCategories.length > 0 && categories) {
        const selectedSlugs = new Set(effectiveCategories);
        const selectedCats = categories.filter((c) => selectedSlugs.has(c.slug));
        const ids = new Set<string>();
        for (const c of selectedCats) {
          ids.add(c.id);
          if (c.parent_id == null) {
            for (const child of categories) {
              if (child.parent_id === c.id) ids.add(child.id);
            }
          }
        }
        if (ids.size === 0) return emptyPage;
        qb = qb.in("category_id", Array.from(ids));
      }

      // Conditions
      if (search.conditions && search.conditions.length > 0) {
        qb = qb.in("condition", search.conditions);
      }

      // Category-specific attribute filters (e.g. Bil's "hestekrefter")
      const attrFilters = decodeAttrFilters(search.attrs);
      qb = applyAttributeFilters(qb, attrFilters);

      // Price
      const includeFree = search.includeFree ?? true;
      if (!includeFree) qb = qb.eq("is_free", false);
      if (typeof search.min === "number") {
        if (includeFree) {
          qb = qb.or(`is_free.eq.true,price_nok.gte.${search.min}`);
        } else {
          qb = qb.gte("price_nok", search.min);
        }
      }
      if (typeof search.max === "number") {
        if (includeFree) {
          qb = qb.or(`is_free.eq.true,price_nok.lte.${search.max}`);
        } else {
          qb = qb.lte("price_nok", search.max);
        }
      }

      const mapRow = (l: SelectedListingRow) => {
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
          lat: l.display_lat as number | null,
          lng: l.display_lng as number | null,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
          mileage_km: typeof mileageRaw === "number" ? mileageRaw : null,
        };
      };

      // Relevance sort can't be expressed as a DB ORDER BY (rank lives only
      // in the RPC result, not a table column), so we paginate over the
      // rank-sorted id list ourselves and re-sort the fetched rows to match.
      if (search.sort === "relevance" && searchRank) {
        const rankedIds = Array.from(searchRank.keys());
        const pageIds = rankedIds.slice(pageParam, pageParam + PAGE_SIZE);
        if (pageIds.length === 0) return emptyPage;
        const { data, error } = await qb.in("id", pageIds);
        if (error) throw error;
        const byId = new Map((data ?? []).map((l) => [l.id, l]));
        const rows = pageIds
          .map((id) => byId.get(id))
          .filter((l): l is NonNullable<typeof l> => l != null)
          .map(mapRow);
        logSearch(rankedIds.length);
        return {
          rows,
          totalCount: rankedIds.length,
          nextOffset: pageParam + PAGE_SIZE < rankedIds.length ? pageParam + PAGE_SIZE : null,
        };
      }

      if (search.sort === "price_asc")
        qb = qb.order("price_nok", { ascending: true, nullsFirst: false });
      else if (search.sort === "price_desc")
        qb = qb.order("price_nok", { ascending: false, nullsFirst: false });
      else qb = qb.order("created_at", { ascending: false });

      const { data, error, count } = await qb.range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;

      const raw = data ?? [];
      logSearch(count ?? raw.length);
      return {
        rows: raw.map(mapRow),
        totalCount: count ?? null,
        nextOffset: raw.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null,
      };
    },
  });
}
