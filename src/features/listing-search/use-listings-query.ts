import { useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/lib/categories";
import {
  rowContainsTerm,
  searchSchema,
  type ListingsPage,
} from "@/features/listing-search/search-schema";

const PAGE_SIZE = 20;

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
 * query, include/exclude term-group filtering, category/price/condition
 * filters, and the client-side exclusion pass for "exclude if ALL words
 * present" (which PostgREST can't express directly).
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
      ];
      const excludeAnyGroups = extraGroups.filter((g) => g.exclude && g.mode === "any");
      const excludeAllGroups = extraGroups.filter((g) => g.exclude && g.mode === "all");
      // "exclude if ALL words present" needs a row-level AND-then-negate that
      // PostgREST/supabase-js can't express via chained filters, so it's
      // applied client-side below — fetch a larger buffer to compensate for
      // rows trimmed after that pass.
      const needsClientExclude = excludeAllGroups.length > 0;
      const emptyPage: ListingsPage = { rows: [], totalCount: 0, nextOffset: null };

      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, description, price_nok, is_free, city, display_lat, display_lng, created_at, listing_images(storage_path, sort_order)",
          // Total antall treff hentes bare på første side; klient-ekskludering
          // filtrerer etterpå, så der finnes ikke noe presist servertall.
          { count: pageParam === 0 && !needsClientExclude ? "exact" : undefined },
        )
        .eq("status", "active");

      if (search.lat != null && search.lng != null) {
        const ids = radiusIds ?? [];
        if (ids.length === 0) return emptyPage;
        qb = qb.in("id", ids);
      }

      // Include groups: AND between groups (each chained .or() call is ANDed
      // by PostgREST), OR within a group's own words ("any") or AND of
      // per-word .or() calls within a group ("all").
      for (const g of includeGroups) {
        if (g.terms.length === 0) continue;
        if (g.mode === "all") {
          for (const term of g.terms) {
            const p = `%${term}%`;
            qb = qb.or(`title.ilike.${p},description.ilike.${p},city.ilike.${p}`);
          }
        } else {
          const parts = g.terms.flatMap((t: string) => {
            const p = `%${t}%`;
            return [`title.ilike.${p}`, `description.ilike.${p}`, `city.ilike.${p}`];
          });
          qb = qb.or(parts.join(","));
        }
      }

      // Exclude groups (mode "any"): exclude rows where any word matches any
      // field — AND of NOT-ilike per (word × field), chainable directly.
      for (const g of excludeAnyGroups) {
        for (const term of g.terms) {
          const p = `%${term}%`;
          qb = qb.not("title", "ilike", p).not("description", "ilike", p).not("city", "ilike", p);
        }
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

      if (search.sort === "price_asc")
        qb = qb.order("price_nok", { ascending: true, nullsFirst: false });
      else if (search.sort === "price_desc")
        qb = qb.order("price_nok", { ascending: false, nullsFirst: false });
      else qb = qb.order("created_at", { ascending: false });

      // pageParam er rå database-offset. Uten klient-ekskludering er én side
      // nøyaktig PAGE_SIZE rader; med klient-ekskludering hentes en større
      // buffer, filtreres, og neste offset settes til raden etter siste
      // beholdte, så tidligere sider aldri re-hentes.
      const fetchSize = needsClientExclude ? PAGE_SIZE * 4 : PAGE_SIZE;
      const { data, error, count } = await qb.range(pageParam, pageParam + fetchSize - 1);
      if (error) throw error;

      const raw = data ?? [];
      const mapRow = (l: (typeof raw)[number]) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
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
        };
      };

      if (!needsClientExclude) {
        return {
          rows: raw.map(mapRow),
          totalCount: count ?? null,
          nextOffset: raw.length === fetchSize ? pageParam + fetchSize : null,
        };
      }

      const isExcluded = (l: (typeof raw)[number]) =>
        excludeAllGroups.some(
          (g) => g.terms.length > 0 && g.terms.every((t) => rowContainsTerm(l, t)),
        );
      const kept: typeof raw = [];
      let consumed = raw.length;
      for (let i = 0; i < raw.length; i++) {
        if (isExcluded(raw[i])) continue;
        kept.push(raw[i]);
        if (kept.length === PAGE_SIZE) {
          consumed = i + 1;
          break;
        }
      }
      const bufferExhausted = raw.length < fetchSize && kept.length < PAGE_SIZE;
      return {
        rows: kept.map(mapRow),
        totalCount: null,
        nextOffset: bufferExhausted ? null : pageParam + consumed,
      };
    },
  });
}
