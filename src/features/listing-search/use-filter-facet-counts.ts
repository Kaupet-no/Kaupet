import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

type Args = {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  categoryIds: string[] | null;
  conditions: string[];
  min: number | undefined;
  max: number | undefined;
  includeFree: boolean;
};

/**
 * Per-value result counts (e.g. "Diesel 98") shown next to filter options in
 * chip popovers and the "Flere filter" dialog, via the
 * `listing_filter_facet_counts` RPC. Mirrors the category/condition/price
 * resolution `use-listings-query.ts` does for the main listings fetch, minus
 * the free-text/radius id constraint — a facet count that ignores an active
 * text search or map radius is a deliberate simplification (see the
 * implementation plan's follow-up list), not an oversight.
 */
export function useFilterFacetCounts({
  filters,
  values,
  categoryIds,
  conditions,
  min,
  max,
  includeFree,
}: Args) {
  const facetKeys = filters.map((f) => f.key);

  return useQuery({
    queryKey: [
      "filter-facet-counts",
      facetKeys,
      values,
      categoryIds,
      conditions,
      min,
      max,
      includeFree,
    ],
    enabled: facetKeys.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listing_filter_facet_counts", {
        p_category_ids: categoryIds ?? undefined,
        p_conditions: conditions.length > 0 ? conditions : undefined,
        p_price_min: min,
        p_price_max: max,
        p_include_free: includeFree,
        p_active_attrs: values,
        p_facet_keys: facetKeys,
      });
      if (error) throw error;
      const counts: Record<string, Record<string, number>> = {};
      for (const row of data ?? []) {
        (counts[row.attr_key] ??= {})[row.attr_value] = row.cnt;
      }
      return counts;
    },
  });
}
