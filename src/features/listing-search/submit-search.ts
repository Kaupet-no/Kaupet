import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { CategoryFilter, VehicleBrandGroup } from "@/lib/category-filters";
import { resolveTextToFilters, type InterpretedCriterion } from "./resolve-text-to-filters";
import {
  writeAppliedSearchState,
  type AppliedSearchState,
  type SearchParams,
} from "./search-schema";

type SearchResolutionParams = {
  applied?: AppliedSearchState;
  query?: string;
  categories?: Category[];
  vehicleBrands?: { name: string; category_group: VehicleBrandGroup }[];
  allFilters?: CategoryFilter[];
};

export type ResolvedAppliedSearch = {
  applied: AppliedSearchState;
  criteria: InterpretedCriterion[];
};

/** Resolves optional text into the complete applied state without committing it. */
export async function resolveAppliedSearch({
  applied = { value: defaultAdvancedSearchValue(), attributes: {} },
  query,
  categories = [],
  vehicleBrands = [],
  allFilters = [],
}: SearchResolutionParams): Promise<ResolvedAppliedSearch> {
  if (query === undefined) return { applied, criteria: [] };

  const resolved = await resolveTextToFilters({
    q: query,
    categories,
    vehicleBrands,
    allFilters,
  }).catch(() => ({
    q: query.trim(),
    categorySlug: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    attrPatch: {},
    criteria: [],
  }));

  return {
    applied: {
      value: {
        ...applied.value,
        terms: resolved.q.split(/\s+/).filter(Boolean),
        categories:
          applied.value.categories.length > 0
            ? applied.value.categories
            : resolved.categorySlug
              ? [resolved.categorySlug]
              : [],
        min: resolved.minPrice ?? applied.value.min,
        max: resolved.maxPrice ?? applied.value.max,
      },
      attributes: { ...applied.attributes, ...resolved.attrPatch },
    },
    criteria: resolved.criteria,
  };
}

type SubmitSearchParams = SearchResolutionParams & {
  commit: (search: SearchParams) => void;
};

/** Resolves optional text and commits the complete applied search to the URL once. */
export async function submitSearch({ commit, ...params }: SubmitSearchParams): Promise<void> {
  if (params.query === undefined) {
    const applied = params.applied ?? { value: defaultAdvancedSearchValue(), attributes: {} };
    commit(writeAppliedSearchState(applied));
    return;
  }
  const { applied } = await resolveAppliedSearch(params);
  commit(writeAppliedSearchState(applied));
}
