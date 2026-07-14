import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyAttributeFilters, type AttributeFilterValue } from "@/lib/category-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type UseLandingResultCountArgs = {
  categoryIds: string[];
  filterValues: Record<string, AttributeFilterValue>;
  priceMin: number | undefined;
  priceMax: number | undefined;
};

/** Live "N treff akkurat nå" count for the landing page's category
 * drill-down panel — debounced so typing in a filter doesn't fire a query
 * per keystroke. */
export function useLandingResultCount({
  categoryIds,
  filterValues,
  priceMin,
  priceMax,
}: UseLandingResultCountArgs) {
  const countQueryInput = useMemo(
    () => ({ categoryIds, filterValues, priceMin, priceMax }),
    [categoryIds, filterValues, priceMin, priceMax],
  );
  const debouncedCountInput = useDebouncedValue(countQueryInput, 300);

  const { data: resultCount } = useQuery({
    queryKey: ["landing-result-count", debouncedCountInput],
    enabled: debouncedCountInput.categoryIds.length > 0,
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .in("category_id", debouncedCountInput.categoryIds);
      qb = applyAttributeFilters(qb, debouncedCountInput.filterValues);
      if (typeof debouncedCountInput.priceMin === "number") {
        qb = qb.gte("price_nok", debouncedCountInput.priceMin);
      }
      if (typeof debouncedCountInput.priceMax === "number") {
        qb = qb.lte("price_nok", debouncedCountInput.priceMax);
      }
      const { count, error } = await qb;
      if (error) throw error;
      return count ?? 0;
    },
  });

  return resultCount;
}
