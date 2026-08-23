import { useEffect, useMemo } from "react";
import { z } from "zod";
import { hapticNotification } from "@/lib/haptics";
import { valueToCriteria } from "@/components/advanced-search-value";
import type { LocationValue } from "@/components/location-filter";
import {
  searchSchema,
  decodeAttrFilters,
  encodeAttrFilters,
  readAppliedSearchState,
  writeAppliedSearchState,
  type AppliedSearchState,
} from "@/features/listing-search/search-schema";
import { buildTree } from "@/lib/categories";
import {
  effectiveFiltersForCategories,
  setAttributeFilterValue,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";

type Search = z.infer<typeof searchSchema>;
type Category = { id: string; slug: string; name_nb: string; parent_id: string | null };

/** Whether `filter`'s own options actually contain the value(s) held in
 * `value` — used to disambiguate a shared attribute key (e.g. "fuel_type")
 * between categories that define completely different vocabularies for it.
 * Kinds without an option list (boolean/text/range) have nothing to
 * validate against, so they're treated as a match by default. */
function filterMatchesValue(
  filter: CategoryFilter,
  value: AttributeFilterValue | undefined,
): boolean {
  if (!value) return false;
  if (value.kind === "select") return !!filter.options?.some((o) => o.value === value.value);
  if (value.kind === "multiselect" || value.kind === "exclude") {
    return value.values.every((v) => filter.options?.some((o) => o.value === v));
  }
  return true;
}

/**
 * Derives all the search-page state that follows purely from the URL search
 * params (`search`) plus the categories/filters lookups: category tree,
 * effective attribute filters, decoded attribute values, the advanced-search
 * panel's initial value, the "save search" criteria, and the handlers that
 * write back to the URL. Pulled out of annonser.tsx (BrowsePage), which
 * mixed this with map state, WTB tab state, and the render tree.
 */
export function useAnnonserSearchState(params: {
  search: Search;
  // TanStack Router's route-scoped useNavigate() return type is tied to the
  // exact route registry and doesn't survive being passed through a plain
  // parameter — accept it loosely at this boundary rather than fight that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: { search: any; resetScroll?: boolean }) => void;
  categories: Category[] | undefined;
  allFilters: CategoryFilter[] | undefined;
  setQDraft: (q: string) => void;
}) {
  const { search, navigate, categories, allFilters, setQDraft } = params;

  const appliedSearch = useMemo(() => readAppliedSearchState(search), [search]);
  const location: LocationValue = appliedSearch.value.location;
  const effectiveCategories = appliedSearch.value.categories;

  const categoryTree = useMemo(() => buildTree(categories ?? []), [categories]);

  const attrValues = appliedSearch.attributes;

  const attrFilters = useMemo(() => {
    const ids = effectiveCategories
      .map((slug: string) => categoryTree.bySlug.get(slug)?.id)
      .filter((id): id is string => !!id);
    const scoped = effectiveFiltersForCategories(ids, allFilters ?? [], categoryTree.byId);
    if (effectiveCategories.length > 0) return scoped;
    // No category selected: `effectiveFiltersForCategories` is always []
    // then, since it's category-scoped — but free-text search can now set
    // attribute values without a category (e.g. "elektrisk SUV"), and those
    // still need a CategoryFilter (for its label/options) to render as an
    // editable/removable chip instead of silently disappearing.
    const activeKeys = new Set(Object.keys(attrValues));
    if (activeKeys.size === 0) return [];
    const byKey = new Map<string, CategoryFilter>();
    for (const f of allFilters ?? []) {
      if (!activeKeys.has(f.key)) continue;
      const existing = byKey.get(f.key);
      if (!existing) {
        byKey.set(f.key, f);
        continue;
      }
      // The same key can mean entirely different things in different
      // categories (e.g. "fuel_type" is "Drivstoff"/el·bensin·diesel on
      // vehicles, but "Brenseltype"/gass·kull·elektrisk on Grill) — prefer
      // whichever candidate's own options actually contain the matched
      // value, so the chip shows the right label/option instead of an
      // arbitrary other category's vocabulary.
      if (
        !filterMatchesValue(existing, attrValues[f.key]) &&
        filterMatchesValue(f, attrValues[f.key])
      ) {
        byKey.set(f.key, f);
      }
    }
    return Array.from(byKey.values());
  }, [effectiveCategories, categoryTree, allFilters, attrValues]);

  // Category-specific attribute filters (e.g. vehicle brand) only make sense
  // within the category they belong to. If the user navigates to a category
  // that doesn't support a given attr key, prune it from the URL so it stops
  // silently narrowing results after its filter chip has disappeared from
  // the UI. Category-agnostic fields (price, condition, location, etc.) are
  // untouched since they live outside `attrs`. Skip while categories/filters
  // are still loading — attrFilters is empty then regardless of the real
  // category, which would otherwise wipe valid attrs before data arrives.
  useEffect(() => {
    if (!categories || !allFilters) return;
    // With no category selected, `attrFilters` is always empty (it's
    // category-scoped) — that's not the same as "no attribute keys are
    // valid": free-text search can now recognize e.g. "elbil"/"SUV" without
    // a category chosen (see useTextToFilterPipeline), so any key that
    // exists on *some* category is allowed to stick around rather than
    // being wiped the instant it's set.
    const allowedKeys =
      effectiveCategories.length === 0
        ? new Set(allFilters.map((f) => f.key))
        : new Set(attrFilters.map((f) => f.key));
    const hasStale = Object.keys(attrValues).some((k) => !allowedKeys.has(k));
    if (!hasStale) return;

    const pruned: Record<string, AttributeFilterValue> = {};
    for (const [k, v] of Object.entries(attrValues)) {
      if (allowedKeys.has(k)) pruned[k] = v;
    }
    const nextAttrs = encodeAttrFilters(pruned);
    if (nextAttrs === search.attrs) return;

    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, attrs: nextAttrs }),
      resetScroll: false,
    });
  }, [
    attrFilters,
    attrValues,
    search.attrs,
    navigate,
    categories,
    allFilters,
    effectiveCategories,
  ]);

  // Derives the next `attrs` from the router's own `prev` search state
  // rather than the `attrValues` closed over at render time — the text-to-
  // filter pipeline can call this more than once in the same synchronous
  // pass (e.g. "elektrisk SUV" matching both fuel_type and body_type at
  // once), and each call would otherwise compute `next` from the *same*
  // stale `attrValues` snapshot, so the second call's `navigate` would
  // silently overwrite the first call's change instead of building on it.
  const handleAttrValueChange = (key: string, value: AttributeFilterValue | undefined) => {
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => {
        const next = setAttributeFilterValue(decodeAttrFilters(prev.attrs), key, value);
        return { ...prev, attrs: encodeAttrFilters(next) };
      },
      resetScroll: false,
    });
  };

  const terms = appliedSearch.value.terms;

  const currentCriteria = useMemo(
    () => ({
      ...valueToCriteria(appliedSearch.value),
      sort: search.sort === "relevance" ? "new" : search.sort,
    }),
    [appliedSearch.value, search.sort],
  );

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }),
      resetScroll: false,
    });
  };

  /** Commits the complete panel draft in one URL transition. Keeping draft
   * changes out of the URL prevents expensive result refetches for every
   * slider tick and makes Avbryt behave as users expect. */
  const applyPanelDraft = (draft: AppliedSearchState) => {
    void hapticNotification("success");
    updateSearch(writeAppliedSearchState(draft));
  };

  const handleLocationChange = (v: LocationValue) => {
    updateSearch({
      lat: v.lat ?? undefined,
      lng: v.lng ?? undefined,
      radius: v.lat != null ? v.radius : undefined,
      loc: v.label || undefined,
    });
  };

  const resetFilters = () => {
    navigate({ search: () => ({ q: "", category: "", sort: "new" }) });
    setQDraft("");
  };

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
  };
}
