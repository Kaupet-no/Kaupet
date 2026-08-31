import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CategoryRecord = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  heading_font: string | null;
  search_examples: string[];
  is_hidden: boolean;
  title_example: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * Single cached source for the full `categories` table, one row per
 * category with every column. Every screen that needs categories — browse,
 * landing, the listing wizard, breadcrumbs, admin dialogs — reads from this
 * same query key with the same full row shape, then narrows/derives what it
 * needs client-side (see `visibleCategories` below). Previously each screen
 * ran its own `useQuery` with a different key and a different column subset
 * ("with-color", "with-parent", "with-hidden-flag", "landing", plain
 * "categories" with six different select lists) — sharing a key across
 * differently-shaped queries risked one caching an incomplete row for
 * another, and the fragmentation meant every screen refetched independently
 * instead of sharing one cache entry.
 */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<CategoryRecord[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Hidden categories (e.g. the E2E test category) are only pickable for
 * demo/admin users — the same rule the listing wizard and the category-
 * change dialog already applied independently before this was shared.
 */
export function visibleCategories<T extends { is_hidden: boolean }>(
  categories: T[],
  isDemo: boolean,
): T[] {
  return categories.filter((c) => isDemo || !c.is_hidden);
}
