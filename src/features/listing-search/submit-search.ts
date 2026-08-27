import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { CategoryFilter, VehicleBrandGroup } from "@/lib/category-filters";
import { resolveTextToFilters } from "./resolve-text-to-filters";
import {
  writeAppliedSearchState,
  type AppliedSearchState,
  type SearchParams,
} from "./search-schema";

type SubmitSearchParams = {
  applied?: AppliedSearchState;
  query?: string;
  categories?: Category[];
  vehicleBrands?: { name: string; category_group: VehicleBrandGroup }[];
  allFilters?: CategoryFilter[];
  commit: (search: SearchParams) => void;
};

/** Resolves optional text and commits the complete applied search to the URL once. */
export async function submitSearch({
  applied = { value: defaultAdvancedSearchValue(), attributes: {} },
  query,
  categories = [],
  vehicleBrands = [],
  allFilters = [],
  commit,
}: SubmitSearchParams): Promise<void> {
  let next = applied;

  if (query !== undefined) {
    const resolved = await resolveTextToFilters({
      q: query,
      categories,
      vehicleBrands,
      allFilters,
    }).catch(() => ({
      q: query.trim(),
      categorySlug: undefined,
      attrPatch: {},
      criteria: [],
    }));

    next = {
      value: {
        ...applied.value,
        terms: resolved.q.split(/\s+/).filter(Boolean),
        categories:
          applied.value.categories.length > 0
            ? applied.value.categories
            : resolved.categorySlug
              ? [resolved.categorySlug]
              : [],
      },
      attributes: { ...applied.attributes, ...resolved.attrPatch },
    };
  }

  commit(writeAppliedSearchState(next));
}
