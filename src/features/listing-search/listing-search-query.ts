import type { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { resolveCategoryIds, type Category } from "@/lib/categories";
import { expandBodyTypeSearchValues } from "@/lib/vehicle/body-type-search-expansion";
import { decodeAttrFilters, searchSchema } from "@/features/listing-search/search-schema";

export type ListingsSearchParams = z.infer<typeof searchSchema>;

type SearchRequestInput = {
  search: ListingsSearchParams;
  categories: Pick<Category, "id" | "slug" | "parent_id">[] | undefined;
  effectiveCategories: string[];
  terms: string[];
  limit: number;
  offset: number;
};

type SearchScopeInput = Omit<SearchRequestInput, "limit" | "offset">;

/** Builds the one canonical argument set for `search_listings_page` so the
 * result list and draft result count cannot drift as filters evolve. `null`
 * means the selected category slugs resolve to no category IDs. */
export function buildListingsSearchRpcArgs({
  search,
  categories,
  effectiveCategories,
  terms,
  limit,
  offset,
}: SearchRequestInput) {
  const extraGroups = search.extraGroups ?? [];
  const includeGroups = [
    { mode: search.qMode ?? "all", terms },
    ...extraGroups.filter((group) => !group.exclude),
  ].filter((group) => group.terms.length > 0);
  const excludeAnyTerms = extraGroups
    .filter((group) => group.exclude && group.mode === "any")
    .flatMap((group) => group.terms);
  const excludeAllGroups = extraGroups
    .filter((group) => group.exclude && group.mode === "all")
    .map((group) => group.terms)
    .filter((groupTerms) => groupTerms.length > 0);
  const categoryIds =
    effectiveCategories.length > 0 && categories
      ? (resolveCategoryIds(effectiveCategories, categories) ?? [])
      : null;
  if (categoryIds?.length === 0) return null;

  const attrFilters = decodeAttrFilters(search.attrs);
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

  return {
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
    _limit: limit,
    _offset: offset,
  };
}

/** Reuses the canonical listing search to find the highest priced matching
 * listing. The selected maximum is deliberately omitted so lowering the
 * filter never makes the slider unable to expand again. */
export function buildListingsPriceMaxRpcArgs(input: SearchScopeInput) {
  return buildListingsSearchRpcArgs({
    ...input,
    search: { ...input.search, max: undefined, sort: "price_desc" },
    limit: 1,
    offset: 0,
  });
}

export async function runListingsSearch(
  args: NonNullable<ReturnType<typeof buildListingsSearchRpcArgs>>,
  signal?: AbortSignal,
) {
  const request = supabase.rpc("search_listings_page", args);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}
