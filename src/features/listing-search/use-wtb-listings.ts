import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Category } from "@/lib/categories";
import {
  countWtbListings,
  listWtbListings,
  type WtbListingWithProfile,
} from "@/lib/wtb-listings.functions";

type UseWtbListingsArgs = {
  q: string;
  effectiveCategories: string[];
  categories: Pick<Category, "id" | "slug">[] | undefined;
  activeTab: "listings" | "wtb";
};

/**
 * "Ønskes kjøpt" (WTB) listings shown alongside the regular search results —
 * a lightweight count query (always enabled when there's search criteria)
 * plus the full list query (only enabled when that tab is active).
 */
export function useWtbListings({
  q,
  effectiveCategories,
  categories,
  activeTab,
}: UseWtbListingsArgs) {
  const countWtbFn = useServerFn(countWtbListings);
  const listWtbFn = useServerFn(listWtbListings);

  const wtbQueryParams = useMemo(
    () => ({
      q: q || undefined,
      categories: effectiveCategories.length
        ? effectiveCategories
            .map((slug: string) => categories?.find((c) => c.slug === slug)?.id)
            .filter((id): id is string => !!id)
        : undefined,
    }),
    [q, effectiveCategories, categories],
  );

  const hasSearchCriteria = !!(q || effectiveCategories.length);

  const { data: wtbCount = 0 } = useQuery({
    queryKey: ["wtb-count", wtbQueryParams],
    enabled: hasSearchCriteria,
    staleTime: 60_000,
    queryFn: () => countWtbFn({ data: wtbQueryParams }),
  });

  const { data: wtbResult, isLoading: wtbLoading } = useQuery({
    queryKey: ["wtb-list", wtbQueryParams],
    enabled: activeTab === "wtb" && hasSearchCriteria,
    staleTime: 60_000,
    queryFn: () => listWtbFn({ data: { ...wtbQueryParams, limit: 50, offset: 0 } }),
  });

  const wtbListings: WtbListingWithProfile[] = wtbResult?.rows ?? [];

  return { wtbCount, wtbLoading, wtbListings, hasSearchCriteria };
}
