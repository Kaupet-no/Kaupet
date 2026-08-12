import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { resolveCategoryIds, type Category } from "@/lib/categories";
import { expandBodyTypeSearchValues } from "@/lib/vehicle/body-type-search-expansion";
import { logSearchQueryEvent } from "@/lib/search-logging.functions";
import {
  decodeAttrFilters,
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

      const categoryIds =
        effectiveCategories.length > 0 && categories
          ? (resolveCategoryIds(effectiveCategories, categories) ?? [])
          : null;
      if (categoryIds?.length === 0) return emptyPage;

      const attrFilters = decodeAttrFilters(search.attrs);
      // Widen a "SUV" body_type search to also include "Kombi" — many SUVs
      // are misclassified as Kombi — without changing what appears checked
      // in the search UI (URL state stays untouched).
      const bodyType = attrFilters.body_type;
      const queryAttrFilters =
        bodyType?.kind === "multiselect"
          ? {
              ...attrFilters,
              body_type: {
                kind: "multiselect" as const,
                values: expandBodyTypeSearchValues(bodyType.values),
              },
            }
          : attrFilters;
      const { data, error } = await supabase.rpc("search_listings_page", {
        _include_groups: includeGroups as Json,
        _exclude_any_terms: excludeAnyTerms.length > 0 ? excludeAnyTerms : null,
        _exclude_all_groups: excludeAllGroups as Json,
        _category_ids: categoryIds,
        _conditions: search.conditions.length > 0 ? search.conditions : null,
        _include_free: search.includeFree ?? true,
        _min_price: search.min ?? null,
        _max_price: search.max ?? null,
        _attribute_filters: queryAttrFilters as Json,
        _center_lat: search.lat ?? null,
        _center_lng: search.lng ?? null,
        _radius_km: search.radius ?? 10,
        _sort: search.sort,
        _limit: PAGE_SIZE,
        _offset: pageParam,
      });
      if (error) throw error;

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
