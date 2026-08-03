import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RootCategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
};

/** Same queryKey/select as `annonser.tsx`'s own category query, so the two
 * share a cache entry and navigating between the header and /annonser
 * doesn't trigger a duplicate fetch. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<RootCategoryRow[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .eq("is_hidden", false)
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
