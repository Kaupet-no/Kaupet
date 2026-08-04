import { fetchSynonymMatches, removeMatchedWords } from "./use-search-synonym-matches";
import { parseNumericFilters, removeNumericMatches } from "@/lib/search-number-parser";
import { stripFillerWords } from "@/lib/search-stopwords";
import { negateSynonymMatches } from "@/lib/search-negation";
import {
  matchCategoryPhrase,
  matchVehicleBrandPhrase,
  removeCategoryMatch,
} from "@/lib/search-category-match";
import {
  effectiveFiltersForCategories,
  type AttributeFilterValue,
  type CategoryFilter,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import { buildTree, type Category } from "@/lib/categories";

export type ResolvedTextFilters = {
  /** The remaining free-text query after every recognized phrase/word has
   * been stripped out. */
  q: string;
  /** Category slug to apply, if a category name or vehicle brand was
   * recognized in the text. */
  categorySlug?: string;
  /** Attribute filter values recognized from equipment synonyms and
   * number+unit facts, keyed the same way handleAttrValueChange expects. */
  attrPatch: Record<string, AttributeFilterValue>;
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
  if (!q) return { q, attrPatch: {} };

  const categoryMatch =
    matchCategoryPhrase(q, categories) ?? matchVehicleBrandPhrase(q, vehicleBrands);
  if (categoryMatch?.source === "category") {
    q = removeCategoryMatch(q, categoryMatch);
  }

  const tree = buildTree(categories);
  const categoryId = categoryMatch ? tree.bySlug.get(categoryMatch.categorySlug)?.id : undefined;
  const attrFilters = categoryId
    ? effectiveFiltersForCategories([categoryId], allFilters, tree.byId)
    : [];

  const attrPatch: Record<string, AttributeFilterValue> = {};

  const numericMatches = parseNumericFilters(q, attrFilters);
  for (const m of numericMatches) {
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

  return { q, categorySlug: categoryMatch?.categorySlug, attrPatch };
}
