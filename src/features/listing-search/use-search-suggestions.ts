import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ListingSuggestion = {
  id: string;
  kaupet_code: string;
  title: string;
};

const SUGGESTION_LIMIT = 5;
const DEBOUNCE_MS = 200;

/**
 * Debounced live search-as-you-type suggestions: the top few matching
 * listing titles for the current query, resolved via the same
 * search_listing_ids RPC used by the main results query (so relevance
 * ranking is consistent between the two).
 */
export function useSearchSuggestions(q: string) {
  const [debouncedQ, setDebouncedQ] = useState(q.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  return useQuery({
    queryKey: ["search-suggestions", debouncedQ],
    queryFn: async (): Promise<ListingSuggestion[]> => {
      const terms = debouncedQ.split(/\s+/).filter(Boolean);
      if (terms.length === 0) return [];

      const { data: matches, error } = await supabase.rpc("search_listing_ids", {
        include_groups: [{ mode: "any", terms }],
      });
      if (error) throw error;

      const topIds = (matches ?? []).slice(0, SUGGESTION_LIMIT).map((m) => m.id);
      if (topIds.length === 0) return [];

      const { data: rows, error: rowsError } = await supabase
        .from("listings")
        .select("id, title, kaupet_code")
        .eq("status", "active")
        .in("id", topIds);
      if (rowsError) throw rowsError;

      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      return topIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
    },
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  });
}
