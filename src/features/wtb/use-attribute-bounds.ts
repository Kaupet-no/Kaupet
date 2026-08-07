import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getAttributeRangeBounds,
  type AttributeRangeBoundsMap,
} from "@/lib/attribute-bounds.functions";
import { boundsForFilter, type RangeBounds } from "@/lib/filter-range-bounds";
import type { CategoryFilter } from "@/lib/category-filters";

/** Fetches the min/max of every numeric attribute across active listings in
 * the category subtree, so WTB sliders span what actually exists on Kaupet. */
export function useAttributeRangeBounds(categoryId: string | null) {
  const fetchBounds = useServerFn(getAttributeRangeBounds);
  return useQuery({
    queryKey: ["attribute-range-bounds", categoryId],
    enabled: !!categoryId,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<AttributeRangeBoundsMap> =>
      fetchBounds({ data: { categoryId: categoryId! } }),
  });
}

/** Slider scale for one WTB criterion: the listing-derived min/max snapped
 * outward to the static scale's step, falling back to the static scale when
 * no listings carry the key (or all carry the same value). The top of the
 * dynamic scale renders as "N+" in RangeFilterField, meaning "N or more". */
export function dynamicBoundsForFilter(
  filter: Pick<CategoryFilter, "key" | "unit" | "label_nb">,
  dynamic: AttributeRangeBoundsMap | undefined,
): RangeBounds {
  const base = boundsForFilter(filter);
  const d = dynamic?.[filter.key];
  if (!d) return base;
  const min = Math.floor(d.min / base.step) * base.step;
  const max = Math.ceil(d.max / base.step) * base.step;
  if (max <= min) return base;
  return { ...base, min, max };
}
