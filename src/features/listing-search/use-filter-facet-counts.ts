import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { getListingFacetCounts } from "@/lib/listing-facet.functions";

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
  const getFacetCounts = useServerFn(getListingFacetCounts);

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
      const data = await getFacetCounts({
        data: {
          categoryIds,
          conditions,
          priceMin: min,
          priceMax: max,
          includeFree,
          activeAttrs: values,
          facetKeys,
        },
      });
      const counts: Record<string, Record<string, number>> = {};
      for (const row of data) {
        (counts[row.attr_key] ??= {})[row.attr_value] = row.cnt;
      }
      return counts;
    },
  });
}
