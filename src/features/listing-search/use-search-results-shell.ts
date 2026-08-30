import { useMemo, useState } from "react";
import { z } from "zod";
import type { ListingCardData } from "@/components/listing-card";
import type { MapListing } from "@/components/listings-map";
import { resolveCategoryIds, type Category, type CatTree } from "@/lib/categories";
import type { CategoryFilter } from "@/lib/category-filters";
import { searchSchema } from "@/features/listing-search/search-schema";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { useFilterFacetCounts } from "@/features/listing-search/use-filter-facet-counts";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import { useTextToFilterPipeline } from "@/features/listing-search/use-text-to-filter-pipeline";
import { useZeroResultExpansion } from "@/features/listing-search/zero-result-expansion";
import { useRegisterSearchPanelResults } from "@/features/listing-search/search-panel/search-panel-context";
import type { SearchPanelResultsContext } from "@/features/listing-search/search-panel/search-panel";
import { countActiveFilters } from "@/features/listing-search/search-panel/search-summary-pill";
import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";

type Search = z.infer<typeof searchSchema>;

/**
 * Composition hook over the shared /annonser search hooks, covering the
 * wiring layer both /annonser and the category landing pages otherwise
 * hand-copy: query state, text-to-filter matching, listings/zero-result
 * queries, card/map derivation and the search-panel registration. Page-
 * specific concerns (hero, subcategory drilldown, WTB tabs,
 * SearchInterpretation UI) stay in the calling page and are not touched
 * here — see docs/ARCHITECTURE.md §4.
 */
export function useSearchResultsShell({
  search,
  navigate,
  categories,
  allFilters,
  qDraft,
  setQDraft,
  resolveCategoryId,
  canRemoveCategoryInZeroResultExpansion,
  onInterpreted,
  ignoredInterpretations,
  markIgnored,
}: {
  search: Search;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: { search: any; resetScroll?: boolean }) => void;
  categories: Category[] | undefined;
  allFilters: CategoryFilter[] | undefined;
  qDraft: string;
  setQDraft: (q: string) => void;
  /** Resolves the category to scope text-to-filter matching to, from the
   * search state this hook derives internally — the resolved hero on
   * /annonser, the fixed page category on a category landing page. Takes a
   * resolver rather than a plain id because the id itself is often derived
   * from `effectiveCategories`/`categoryTree`, which this hook computes. */
  resolveCategoryId: (effectiveCategories: string[], categoryTree: CatTree) => string | null;
  /** Whether the zero-result expansion is allowed to suggest dropping the
   * category filter entirely — `false` on category landing pages, which
   * have a fixed category to stay within. */
  canRemoveCategoryInZeroResultExpansion: boolean;
  /** Structured criteria recognized from typed text — only /annonser shows
   * these (SearchInterpretation UI); omit to ignore. */
  onInterpreted?: (criteria: InterpretedCriterion[]) => void;
  ignoredInterpretations?: Set<string>;
  /** Called with the restored phrase when a removed chip's text goes back
   * into the search box — /annonser uses this to keep it out of
   * `interpretedCriteria` re-matching; category landing pages don't need it. */
  markIgnored?: (restoredText: string) => void;
}) {
  const {
    location,
    effectiveCategories,
    categoryTree,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    terms,
    appliedSearch,
    currentCriteria,
    updateSearch,
    applyPanelDraft,
    handleLocationChange,
    resetFilters,
  } = useAnnonserSearchState({ search, navigate, categories, allFilters, setQDraft });

  const { data: facetCounts } = useFilterFacetCounts({
    filters: attrFilters,
    values: attrValues,
    categoryIds: resolveCategoryIds(effectiveCategories, categories ?? []),
    conditions: search.conditions ?? [],
    min: search.min,
    max: search.max,
    includeFree: search.includeFree ?? true,
  });

  // The original typed phrase behind each auto-applied attribute value, keyed
  // by "filterKey:optionValue" ("filterKey:" for single-value filters) — lets
  // removing an auto-generated chip put the word back in the search box
  // instead of deleting it outright, since the automation can guess wrong.
  const [autoAppliedText, setAutoAppliedText] = useState<Record<string, string>>({});
  // Composite keys of chips that were just auto-applied from typed text —
  // flashed briefly in ActiveFilters so the transition from "word" to "chip"
  // is visible instead of the word just disappearing.
  const [justCreatedKeys, setJustCreatedKeys] = useState<Set<string>>(new Set());
  const flashKeys = (keys: string[]) => {
    if (keys.length === 0) return;
    setJustCreatedKeys((prev) => new Set([...prev, ...keys]));
    setTimeout(() => {
      setJustCreatedKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
    }, 1500);
  };

  useTextToFilterPipeline({
    qDraft,
    setQDraft,
    updateSearch,
    attrFilters,
    allFilters: allFilters ?? [],
    attrValues,
    handleAttrValueChange,
    categoryId: resolveCategoryId(effectiveCategories, categoryTree),
    onApplied: (applied) => {
      setAutoAppliedText((prev) => ({ ...prev, ...applied }));
      flashKeys(Object.keys(applied));
    },
    onInterpreted,
    ignoredInterpretations,
  });

  // Removes an attribute filter the same way onRemoveAttr always has, but
  // first checks whether it was auto-applied from typed text (see
  // autoAppliedText above) — if so, the original word goes back into the
  // search box instead of vanishing, since the automation guessing wrong
  // shouldn't cost the user what they typed.
  const removeAttrWithRestore = (key: string, value?: string, restoreOverride?: string) => {
    const current = attrValues[key];
    const composite =
      value !== undefined && current?.kind === "exclude"
        ? `${key}:!${value}`
        : `${key}:${value ?? ""}`;
    const restoreText = autoAppliedText[composite] ?? restoreOverride;
    if (value !== undefined && current?.kind === "multiselect") {
      const next = current.values.filter((v) => v !== value);
      handleAttrValueChange(
        key,
        next.length > 0 ? { kind: "multiselect", values: next } : undefined,
      );
    } else if (value !== undefined && current?.kind === "exclude") {
      const next = current.values.filter((v) => v !== value);
      handleAttrValueChange(key, next.length > 0 ? { kind: "exclude", values: next } : undefined);
    } else {
      handleAttrValueChange(key, undefined);
    }
    if (restoreText) {
      setAutoAppliedText((prev) => {
        const next = { ...prev };
        delete next[composite];
        return next;
      });
      markIgnored?.(restoreText);
      const nextQ = qDraft ? `${qDraft} ${restoreText}` : restoreText;
      setQDraft(nextQ);
      updateSearch({ q: nextQ });
    }
  };

  const activeFilterCount = countActiveFilters({
    min: search.min,
    max: search.max,
    includeFree: search.includeFree,
    conditions: search.conditions,
    hasLocation: location.lat != null,
    attrCount: Object.keys(attrValues).length,
    extraGroupCount: search.extraGroups?.length ?? 0,
    qModeAny: search.qMode === "any",
  });

  const {
    data: listingsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListingsQuery({ search, categories, effectiveCategories, terms });

  const listings = useMemo(() => listingsData?.pages.flatMap((p) => p.rows), [listingsData]);
  const totalCount = listingsData?.pages[0]?.totalCount ?? null;
  const {
    expansion: zeroResultExpansion,
    expansions: zeroResultExpansions,
    isPending: zeroResultExpansionPending,
  } = useZeroResultExpansion({
    applied: appliedSearch,
    filters: attrFilters,
    categories: categories ?? [],
    enabled: !isLoading && totalCount === 0 && !!categories,
    canRemoveCategory: canRemoveCategoryInZeroResultExpansion,
  });

  const cards: ListingCardData[] = (listings ?? []).map((l) => ({
    id: l.id,
    kaupet_code: l.kaupet_code,
    title: l.title,
    subtitle: l.subtitle,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
    category_slug: l.category_slug,
    attributes: l.attributes,
  }));

  const mapListings: MapListing[] = (listings ?? [])
    .filter((l): l is typeof l & { lat: number; lng: number } => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id,
      kaupet_code: l.kaupet_code,
      title: l.title,
      price_nok: l.price_nok,
      is_free: l.is_free,
      lat: l.lat,
      lng: l.lng,
      cover_path: l.cover_path,
    }));

  const mapCenter =
    search.lat != null && search.lng != null ? { lat: search.lat, lng: search.lng } : null;

  // Det globale panelet redigerer samme URL-drevne draft på web og native.
  const searchPanelResults: SearchPanelResultsContext = {
    applied: appliedSearch,
    onApply: (draft, criteria) => {
      setQDraft(draft.value.terms.join(" "));
      applyPanelDraft(draft);
      if (criteria) onInterpreted?.(criteria);
    },
    attributeFilters: attrFilters,
    attributeCounts: facetCounts,
    resultCount: totalCount ?? cards.length,
  };
  useRegisterSearchPanelResults(searchPanelResults);

  return {
    location,
    effectiveCategories,
    categoryTree,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    terms,
    appliedSearch,
    currentCriteria,
    updateSearch,
    applyPanelDraft,
    handleLocationChange,
    resetFilters,
    facetCounts,
    autoAppliedText,
    justCreatedKeys,
    flashKeys,
    removeAttrWithRestore,
    activeFilterCount,
    listingsData,
    listings,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount,
    zeroResultExpansion,
    zeroResultExpansions,
    zeroResultExpansionPending,
    cards,
    mapListings,
    mapCenter,
    searchPanelResults,
  };
}
