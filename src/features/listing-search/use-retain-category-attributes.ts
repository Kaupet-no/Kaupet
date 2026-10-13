import { useCallback, useMemo } from "react";

import { useAllCategoryFilters } from "@/components/attribute-fields";
import { buildTree, type Category } from "@/lib/categories";
import {
  effectiveFiltersForCategories,
  retainSearchAttributes,
  type AttributeFilterValue,
} from "@/lib/category-filters";

/** Attributtene som overlever et kategoribytte: verdier de nye kategoriene
 * også har beholdes, resten (og avhengige filtre uten forutsetning) fjernes,
 * så skjulte filtre ikke snevrer inn søket (KG-29-F01, KG-30-F01). Samme
 * regel som SearchPanel. Før filtrene er lastet fjernes alt, som før. */
export function useRetainCategoryAttributes(categories: Category[]) {
  const { data: allFilters } = useAllCategoryFilters();
  const tree = useMemo(() => buildTree(categories), [categories]);
  return useCallback(
    (attributes: Record<string, AttributeFilterValue>, slugs: string[]) => {
      const result = allFilters
        ? retainSearchAttributes(
            attributes,
            effectiveFiltersForCategories(
              slugs.map((slug) => tree.bySlug.get(slug)?.id).filter((id): id is string => !!id),
              allFilters,
              tree.byId,
            ),
            { dropUnknown: true },
          )
        : { kept: {}, dropped: Object.keys(attributes) };
      return {
        ...result,
        droppedLabels: [
          ...new Set(
            result.dropped.map(
              (key) => allFilters?.find((filter) => filter.key === key)?.label_nb ?? key,
            ),
          ),
        ],
      };
    },
    [allFilters, tree],
  );
}
