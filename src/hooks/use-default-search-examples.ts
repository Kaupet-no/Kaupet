import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SEARCH_SUGGESTIONS } from "@/lib/search-suggestions";

/**
 * Default example words for the landing page's rotating search-field
 * typewriter animation, shown before any category is selected. Editable in
 * the admin panel (site_settings.default_search_examples); falls back to the
 * hardcoded SEARCH_SUGGESTIONS list while loading or if the row is empty.
 */
export function useDefaultSearchExamples(): string[] {
  const { data } = useQuery({
    queryKey: ["site-settings", "default-search-examples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data?.default_search_examples ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return data?.length ? data : SEARCH_SUGGESTIONS;
}
