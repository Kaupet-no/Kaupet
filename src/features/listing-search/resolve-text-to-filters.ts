import { fetchSynonymMatches, removeMatchedWords } from "./use-search-synonym-matches";
import {
  parseNumericFilters,
  parsePriceFilters,
  removeNumericMatches,
} from "@/lib/search-number-parser";
import { stripFillerWords } from "@/lib/search-stopwords";
import { negateSynonymMatches } from "@/lib/search-negation";
import {
  matchCategoryPhrase,
  matchVehicleBrandPhrase,
  matchVehicleAttributeOptionPhrase,
  removeCategoryMatch,
} from "@/lib/search-category-match";
import {
  effectiveFiltersForCategories,
  vehicleCategoriesForBrandGroup,
  type AttributeFilterValue,
  type CategoryFilter,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import { buildTree, type Category } from "@/lib/categories";

export type InterpretedCriterion =
  | { kind: "category"; slug: string; source: "text" | "user"; matchedText?: string }
  | {
      kind: "attribute";
      key: string;
      value: AttributeFilterValue;
      source: "text" | "user";
      matchedText?: string;
    }
  | {
      kind: "price";
      min?: number;
      max?: number;
      source: "text" | "user";
      matchedText?: string;
    };

export type ResolvedTextFilters = {
  /** The remaining free-text query after every recognized phrase/word has
   * been stripped out. */
  q: string;
  /** Category slug to apply, if a category name or vehicle brand was
   * recognized in the text. */
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Attribute filter values recognized from equipment synonyms and
   * number+unit facts, keyed the same way handleAttrValueChange expects. */
  attrPatch: Record<string, AttributeFilterValue>;
  /** Structured criteria in the same order they appeared in the input. */
  criteria: InterpretedCriterion[];
};

/**
 * One-shot version of the live `useTextToFilterPipeline` coordination —
 * runs the same matchers (category/brand, equipment synonyms, number+unit,
 * filler words) against a full piece of text in a single pass and returns
 * the result, instead of reacting to `qDraft` changes over time. Built for
 * the native search overlay's submit, which has no live chip UI and no
 * category pre-selected — so it resolves the category *first*, then scopes
 * synonym matching to it, unlike the desktop pipeline which is always
 * handed an already-selected category.
 */
export async function resolveTextToFilters(params: {
  q: string;
  categories: Category[];
  vehicleBrands: { name: string; category_group: VehicleBrandGroup }[];
  allFilters: CategoryFilter[];
}): Promise<ResolvedTextFilters> {
  const { categories, vehicleBrands, allFilters } = params;
  let q = params.q.trim();
  if (!q) return { q, attrPatch: {}, criteria: [] };
  const criterionPositions = new Map<string, number>();
  const criterionMatchedText = new Map<string, string>();
  const rememberPosition = (key: string, matchedText: string) => {
    const position = params.q.toLocaleLowerCase().indexOf(matchedText.toLocaleLowerCase());
    if (position < (criterionPositions.get(key) ?? Infinity)) {
      criterionPositions.set(key, position);
      criterionMatchedText.set(key, matchedText);
    }
  };

  // "attribute" is last-priority: it infers a category from a body-type
  // option word ("SUV") that only exists on one category (Bil), so a search
  // with no explicit category/brand name still scopes synonym matching
  // correctly (e.g. "Elektrisk SUV" needs categoryId=Bil for "elektrisk" to
  // resolve to fuel_type=el at all, since global matching gates ambiguous
  // synonyms like "elektrisk" behind a corroborating signal — see
  // fetchSynonymMatches/filterAmbiguousMatches).
  const categoryMatch =
    matchCategoryPhrase(q, categories) ??
    matchVehicleBrandPhrase(q, vehicleBrands) ??
    matchVehicleAttributeOptionPhrase(q, allFilters, categories);
  if (categoryMatch?.source === "category") {
    q = removeCategoryMatch(q, categoryMatch);
  }
  if (categoryMatch) rememberPosition("category", categoryMatch.matchedText);
  // Attribute matches ("SUV") aren't stripped here — the word itself is
  // still valid input to the synonym matcher below, which will now resolve
  // it (and remove it from the free text) as the category-scoped body_type
  // filter it actually is, since categoryId is no longer null.

  const tree = buildTree(categories);
  const brandCategories =
    categoryMatch?.source === "brand" && categoryMatch.brandCategoryGroup
      ? vehicleCategoriesForBrandGroup(
          categoryMatch.brandCategoryGroup,
          categories,
          allFilters,
          tree.byId,
        )
      : [];
  const categorySlug =
    brandCategories.length === 1 ? brandCategories[0].slug : categoryMatch?.categorySlug;
  const categoryId = categorySlug ? tree.bySlug.get(categorySlug)?.id : undefined;
  const attrFilters = categoryId
    ? effectiveFiltersForCategories([categoryId], allFilters, tree.byId)
    : [];

  const attrPatch: Record<string, AttributeFilterValue> = {};
  const priceMatches = parsePriceFilters(q);
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  for (const m of priceMatches) {
    rememberPosition("price", m.matchedText);
    minPrice = m.min ?? minPrice;
    maxPrice = m.max ?? maxPrice;
  }
  q = removeNumericMatches(
    q,
    priceMatches.map((m) => ({ ...m, filterKey: "__price" })),
  );
  const numericMatches = parseNumericFilters(q, attrFilters);
  for (const m of numericMatches) {
    rememberPosition(`attribute:${m.filterKey}`, m.matchedText);
    const current = attrPatch[m.filterKey];
    const currentRange: { min?: number; max?: number } = current?.kind === "range" ? current : {};
    attrPatch[m.filterKey] = {
      kind: "range",
      min: m.min ?? currentRange.min,
      max: m.max ?? currentRange.max,
    };
  }
  q = removeNumericMatches(q, numericMatches);

  let synonymMatches: Awaited<ReturnType<typeof fetchSynonymMatches>>;
  try {
    // categoryId is undefined when no category name/brand was recognized in
    // the text — fetchSynonymMatches(null, ...) then searches every
    // category's vocabulary instead of one, so "elbil"/"ikke el"/"SUV" style
    // matches still resolve without a category (see
    // match_search_synonyms_global.sql for the ambiguity trade-off this makes).
    synonymMatches = await fetchSynonymMatches(categoryId ?? null, q);
  } catch {
    // RPC unavailable (offline, timeout) — fall through with whatever was
    // already resolved rather than blocking the search entirely.
    synonymMatches = [];
  }
  synonymMatches = negateSynonymMatches(q, synonymMatches);
  for (const m of synonymMatches) {
    // attrFilters is category-scoped (empty when no category was
    // recognized) — fall back to the unscoped list so a globally-resolved
    // match still finds its filter `type` (select/multiselect/boolean).
    const filter =
      attrFilters.find((f) => f.key === m.filterKey) ??
      allFilters.find((f) => f.key === m.filterKey);
    if (!filter) continue;
    rememberPosition(`attribute:${m.filterKey}`, m.matchedText);
    if (m.negated) {
      if ((filter.type === "select" || filter.type === "multiselect") && m.optionValue) {
        const current = attrPatch[m.filterKey];
        const values = current?.kind === "exclude" ? current.values : [];
        if (!values.includes(m.optionValue)) {
          attrPatch[m.filterKey] = { kind: "exclude", values: [...values, m.optionValue] };
        }
      }
      continue;
    }
    if (filter.type === "boolean") {
      attrPatch[m.filterKey] = { kind: "boolean", value: true };
    } else if (filter.type === "select" && m.optionValue) {
      attrPatch[m.filterKey] = { kind: "select", value: m.optionValue };
    } else if (filter.type === "multiselect" && m.optionValue) {
      const current = attrPatch[m.filterKey];
      const values = current?.kind === "multiselect" ? current.values : [];
      if (!values.includes(m.optionValue)) {
        attrPatch[m.filterKey] = { kind: "multiselect", values: [...values, m.optionValue] };
      }
    }
  }
  q = removeMatchedWords(q, synonymMatches);
  q = stripFillerWords(q);
  const criteria: InterpretedCriterion[] = [
    ...(categoryMatch
      ? [
          {
            kind: "category" as const,
            slug: categorySlug ?? categoryMatch.categorySlug,
            source: "text" as const,
            matchedText: categoryMatch.matchedText,
          },
        ]
      : []),
    ...(priceMatches.length > 0
      ? [
          {
            kind: "price" as const,
            min: minPrice,
            max: maxPrice,
            source: "text" as const,
            matchedText: priceMatches.map((m) => m.matchedText).join(" "),
          },
        ]
      : []),
    ...Object.entries(attrPatch).map(([key, value]) => ({
      kind: "attribute" as const,
      key,
      value,
      source: "text" as const,
      matchedText: criterionMatchedText.get(`attribute:${key}`),
    })),
  ].sort((a, b) => {
    const key = (criterion: InterpretedCriterion) =>
      criterion.kind === "category"
        ? "category"
        : criterion.kind === "price"
          ? "price"
          : `attribute:${criterion.key}`;
    return (
      (criterionPositions.get(key(a)) ?? Infinity) - (criterionPositions.get(key(b)) ?? Infinity)
    );
  });

  return {
    q,
    categorySlug,
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    attrPatch,
    criteria,
  };
}
