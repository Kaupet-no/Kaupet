import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import type { CategoryFlowRow } from "./category-flows";

/**
 * Fetches all category flow rows once; cached across the app (mirrors
 * useAllCategoryFilters in attribute-fields.tsx). Kept out of category-flows.ts
 * so that pure logic (effectiveFlowForCategory, resolveWizardPages) stays free
 * of React/Supabase-client imports and can be used server-side (createListing).
 */
export function useAllCategoryFlows() {
  return useQuery({
    queryKey: ["category-flows", "all"],
    queryFn: async (): Promise<CategoryFlowRow[]> => {
      const { data, error } = await supabase
        .from("category_flows")
        .select("id, category_id, field_groups, modules, sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}
