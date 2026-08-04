import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type CategoryCandidate = { id: string; slug: string; name_nb: string };

/**
 * Picks which of several candidate categories to suggest for a vehicle-brand
 * search match, when the brand's `category_group` no longer maps to a single
 * category (e.g. "moped_atv" now spans both "ATV" and "Snøscooter" after
 * being split into separate categories — see
 * `vehicleCategoriesForBrandGroup` in category-filters.ts). Picks the
 * candidate with the most matching listings for the current query text,
 * since there's no other reliable signal to disambiguate. Only meant to run
 * when there are 2+ candidates — pass a single-element array (or skip the
 * hook) when the mapping is already unambiguous.
 */
export function useBrandCategoryCandidate(
  candidates: CategoryCandidate[],
  query: string,
): { candidate: CategoryCandidate | null; isLoading: boolean } {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates]);

  const { data: winnerId, isLoading } = useQuery({
    queryKey: ["brand-category-candidate", candidateIds, debouncedQuery],
    enabled: candidateIds.length > 1,
    queryFn: async () => {
      let matchIds: string[] | null = null;
      if (debouncedQuery) {
        const { data: matches, error } = await supabase.rpc("search_listing_ids", {
          include_groups: [{ mode: "all", terms: debouncedQuery.split(/\s+/).filter(Boolean) }],
        });
        if (error) throw error;
        matchIds = (matches ?? []).map((m) => m.id);
        if (matchIds.length === 0) return candidateIds[0] ?? null;
      }

      const counts = await Promise.all(
        candidateIds.map(async (categoryId) => {
          let qb = supabase
            .from("listings")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
            .eq("category_id", categoryId);
          if (matchIds) qb = qb.in("id", matchIds);
          const { count, error } = await qb;
          if (error) throw error;
          return { categoryId, count: count ?? 0 };
        }),
      );

      return counts.reduce((best, c) => (c.count > best.count ? c : best)).categoryId;
    },
  });

  const candidate =
    candidates.length === 1 ? candidates[0] : (candidates.find((c) => c.id === winnerId) ?? null);

  return { candidate, isLoading: candidates.length > 1 && isLoading };
}
