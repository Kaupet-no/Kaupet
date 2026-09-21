import { useCategories, visibleCategories, type CategoryRecord } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/components/attribute-fields";

/** Root/child categories plus their configured attribute filters, used to
 * drive the landing page's category picker and drill-down filter panel.
 * `initialData` lets the landing page's route loader hand over SSR-fetched
 * categories so the grid can render on first paint (see src/routes/index.tsx). */
export function useLandingCategories(initialData?: CategoryRecord[]) {
  const {
    data: allCategoriesRaw,
    isError: categoriesIsError,
    refetch: refetchCategories,
  } = useCategories(initialData);
  const categories = visibleCategories(allCategoriesRaw ?? [], false);

  const { data: allFilters } = useAllCategoryFilters();

  return { categories, categoriesIsError, refetchCategories, allFilters };
}
