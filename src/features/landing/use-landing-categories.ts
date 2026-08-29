import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/components/attribute-fields";

/** Root/child categories plus their configured attribute filters, used to
 * drive the landing page's category picker and drill-down filter panel. */
export function useLandingCategories() {
  const {
    data: allCategoriesRaw,
    isError: categoriesIsError,
    refetch: refetchCategories,
  } = useCategories();
  const categories = visibleCategories(allCategoriesRaw ?? [], false);

  const { data: allFilters } = useAllCategoryFilters();

  return { categories, categoriesIsError, refetchCategories, allFilters };
}
