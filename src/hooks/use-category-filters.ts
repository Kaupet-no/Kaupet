import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { normalizeFilter } from "@/lib/category-filters";

/** Fetches all category filters once; cached across the app. */
export function useAllCategoryFilters() {
  return useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      // select("*") rather than a column list so the query keeps working in
      // the window before the depends_on_not_value/is_optional migration is
      // applied.
      const { data, error } = await supabase
        .from("category_filters")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });
}
