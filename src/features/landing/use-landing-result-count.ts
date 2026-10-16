import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildListingsSearchRpcArgs,
  runListingsSearch,
} from "@/features/listing-search/listing-search-query";
import { encodeAttrFilters, searchSchema } from "@/features/listing-search/search-schema";
import { type AttributeFilterValue } from "@/lib/category-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type UseLandingResultCountArgs = {
  categoryIds: string[];
  filterValues: Record<string, AttributeFilterValue>;
  priceMin: number | undefined;
  priceMax: number | undefined;
  includeFree: boolean;
};

/** Live "N treff akkurat nå" count for the landing page's category
 * drill-down panel — debounced so typing in a filter doesn't fire a query
 * per keystroke. */
export function useLandingResultCount({
  categoryIds,
  filterValues,
  priceMin,
  priceMax,
  includeFree,
}: UseLandingResultCountArgs) {
  const countQueryInput = useMemo(
    () => ({ categoryIds, filterValues, priceMin, priceMax, includeFree }),
    [categoryIds, filterValues, priceMin, priceMax, includeFree],
  );
  const debouncedCountInput = useDebouncedValue(countQueryInput, 300);

  const { data: resultCount } = useQuery({
    queryKey: ["landing-result-count", debouncedCountInput],
    enabled: debouncedCountInput.categoryIds.length > 0,
    queryFn: async ({ signal }) => {
      const input = debouncedCountInput;
      const args = buildListingsSearchRpcArgs({
        search: searchSchema.parse({
          attrs: encodeAttrFilters(input.filterValues),
          min: input.priceMin,
          max: input.priceMax,
          includeFree: input.includeFree,
        }),
        categories: [],
        effectiveCategories: [],
        terms: [],
        limit: 1,
        offset: 0,
        includeRecentlySold: true,
      })!;
      const rows = await runListingsSearch({ ...args, _category_ids: input.categoryIds }, signal);
      return rows[0]?.total_count ?? 0;
    },
  });

  return resultCount;
}
