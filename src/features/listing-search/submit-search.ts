import type { HistoryState } from "@tanstack/react-router";
import { defaultAdvancedSearchValue } from "@/lib/advanced-search-value";
import type { Category } from "@/lib/categories";
import {
  effectiveFiltersForCategory,
  retainSearchAttributes,
  type CategoryFilter,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
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

  // Kategorien som brukes og den som vises i «Tolket som» må samsvare
  // (KG-28-F04): et kategoriord som ikke allerede er valgt erstatter de
  // valgte kategoriene, og attributter som ikke finnes der fjernes. Er
  // ordet en overkategori av alle valg («bil» med «Elbil» valgt), er valget
  // allerede smalere: det beholdes, og kategoritolkningen utelates.
  const selected = applied.value.categories;
  const byId = new Map(categories.map((category) => [category.id, category]));
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const textCategory = resolved.categorySlug ? bySlug.get(resolved.categorySlug) : undefined;
  const coversSelection =
    !!textCategory &&
    selected.length > 0 &&
    selected.every((slug) => {
      for (let c = bySlug.get(slug); c; c = c.parent_id ? byId.get(c.parent_id) : undefined) {
        if (c.id === textCategory.id) return true;
      }
      return false;
    });
  const replacedCategory = selected.length > 0 && !coversSelection ? textCategory : undefined;
  const previousAttributes = replacedCategory
    ? retainSearchAttributes(
        applied.attributes,
        effectiveFiltersForCategory(replacedCategory.id, allFilters, byId),
        { dropUnknown: true },
      ).kept
    : applied.attributes;
  const criteria = coversSelection
    ? resolved.criteria.filter((criterion) => criterion.kind !== "category")
    : resolved.criteria;

  return {
    applied: {
      value: {
        ...applied.value,
        terms: resolved.q.split(/\s+/).filter(Boolean),
        categories: replacedCategory
          ? [replacedCategory.slug]
          : selected.length > 0
            ? selected
            : resolved.categorySlug
              ? [resolved.categorySlug]
              : [],
        min: resolved.minPrice ?? applied.value.min,
        max: resolved.maxPrice ?? applied.value.max,
      },
      attributes: { ...previousAttributes, ...resolved.attrPatch },
    },
    criteria,
  };
}

type SubmitSearchParams = SearchResolutionParams & {
  /** `criteria` er tolkningen av søketeksten — send den med
   * via `interpretedSearchState`, så /annonser kan vise «Tolket som».
   * Utelatt når det ikke er tekst å tolke. */
  commit: (search: SearchParams, criteria?: InterpretedCriterion[]) => void;
};

/** Router-state som tar med tolkningen til /annonser (se HistoryState i
 * router.tsx). */
export function interpretedSearchState(criteria: InterpretedCriterion[] = []): HistoryState {
  return { interpretedCriteria: criteria };
}

export function readInterpretedSearchState(
  state: HistoryState | undefined,
): InterpretedCriterion[] {
  return state?.interpretedCriteria ?? [];
}

/** Resolves optional text and commits the complete applied search to the URL once. */
export async function submitSearch({ commit, ...params }: SubmitSearchParams): Promise<void> {
  if (params.query === undefined) {
    const applied = params.applied ?? { value: defaultAdvancedSearchValue(), attributes: {} };
    commit(writeAppliedSearchState(applied));
    return;
  }
  const { applied, criteria } = await resolveAppliedSearch(params);
  commit(writeAppliedSearchState(applied), criteria);
}
