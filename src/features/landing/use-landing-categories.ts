import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeFilter } from "@/lib/category-filters";
import type { CategoryRow } from "@/features/landing/landing-types";

/** Root/child categories plus their configured attribute filters, used to
 * drive the landing page's category picker and drill-down filter panel. */
export function useLandingCategories() {
  const {
    data: categories,
    isError: categoriesIsError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color, heading_font, search_examples")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  return { categories, categoriesIsError, refetchCategories, allFilters };
}
