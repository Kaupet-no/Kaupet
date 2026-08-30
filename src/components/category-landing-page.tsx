import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { ActiveFilters } from "@/components/active-filters";
import { ResultList } from "@/components/result-list";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { SearchSummaryPill } from "@/features/listing-search/search-panel/search-summary-pill";
import { SearchResultsBody } from "@/features/listing-search/search-panel/search-results-body";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import { CategoryHero } from "@/components/category-hero";
import { buildTree, descendants, pathFromAncestor, type Category } from "@/lib/categories";
import { vehicleCategoryGroupFor, genericBrandFilterFor } from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { SearchBar } from "@/components/search-bar";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useSearchResultsShell } from "@/features/listing-search/use-search-results-shell";
import { useIsNative } from "@/hooks/use-is-native";
import { useIsDesktop } from "@/hooks/use-form-factor";

type Search = z.infer<typeof searchSchema>;

type Props = {
  /** This page's own URL-level category — a main category for /{slug}, or a
   * subcategory for /{main}/{sub}. Drilling deeper (via `subSlug`) never
   * leaves this page — it only changes which descendant is scoped/shown. */
  category: Category;
  /** Breadcrumb chain of *real, distinct URLs* leading to (and including)
   * `category` — [main] or [main, sub]. */
  breadcrumb: Category[];
  /** Slug of a descendant of `category` to scope the page to instead —
   * e.g. from the homepage's category picker drilling past this page's own
   * level (Interiør > Møbler > Sofa still lands on /interiør, with `sub`
   * carrying "sofa"). Ignored if it isn't actually a descendant of `category`. */
  subSlug?: string;
  /** Search param key `subSlug` is read from/written to — "sub" on
   * /{main}, but that name is already a path param on /{main}/{sub}, so that
   * route uses "sub2" instead. */
  subSlugParam: "sub" | "sub2";
  /** Full /annonser-shaped search state for this route — the page shares the
   * same schema and query logic as /annonser, only forcing the category. */
  search: Search;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: { search: any }) => void;
};

/**
 * Category landing page — renders the exact same filter row, active-filter
 * chips and result list as /annonser (via useAnnonserSearchState/
 * useListingsQuery/ResultList), scoped to this page's category, with a hero
 * banner on top for quick sub-category drilldown and SEO copy.
 */
export function CategoryLandingPage({
  category,
  breadcrumb,
  subSlug,
  subSlugParam,
  search,
  navigate,
}: Props) {
  const isNative = useIsNative();
  const [qDraft, setQDraft] = useState(search.q);
  const isDesktop = useIsDesktop();
  const { openPanel } = useSearchPanel();

  useEffect(() => setQDraft(search.q), [search.q]);

  const { data: allCategoriesRaw } = useCategories();
  const categories = useMemo(
    () => visibleCategories(allCategoriesRaw ?? [], false),
    [allCategoriesRaw],
  );

  const { data: allFilters } = useAllCategoryFilters();

  const tree = useMemo(() => buildTree(categories ?? []), [categories]);

  // The category actually scoped/shown right now — `category` itself, or one
  // of its descendants when `subSlug` deep-links past this page's own level.
  const selected = useMemo(() => {
    if (!subSlug) return category;
    const found = tree.bySlug.get(subSlug);
    if (!found || found.id === category.id) return category;
    const isDescendant = descendants(category, tree).some((d) => d.id === found.id);
    return isDescendant ? found : category;
  }, [subSlug, category, tree]);

  const extraPath = useMemo(
    () => pathFromAncestor(category, selected, tree),
    [category, selected, tree],
  );
  const breadcrumbEntries = useMemo(() => [...breadcrumb, ...extraPath], [breadcrumb, extraPath]);
  const children = tree.childrenByParent.get(selected.id) ?? [];

  // Selecting a different (deeper/shallower/sibling) category never navigates
  // away from this page's own URL — it only updates the search param.
  const selectCategory = (target: Category) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [subSlugParam]: target.id === category.id ? undefined : target.slug,
      }),
    });
  };

  // The set of category slugs this page is scoped to — `selected` plus every
  // descendant at any depth, so a hub category (e.g. "Møbler") still covers
  // all its leaves ("Sofa", "Stol", ...), matching what this page showed
  // before it shared /annonser's single-level-expansion query logic.
  const scopedSlugs = useMemo(
    () => [selected.slug, ...descendants(selected, tree).map((d) => d.slug)],
    [selected, tree],
  );

  const effectiveSearch: Search = useMemo(
    () => ({ ...search, category: "", categories: scopedSlugs, catMode: "any" }),
    [search, scopedSlugs],
  );

  const {
    location,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    terms,
    updateSearch,
    handleLocationChange,
    resetFilters,
    justCreatedKeys,
    removeAttrWithRestore,
    activeFilterCount,
    facetCounts,
    applyPanelDraft,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount,
    zeroResultExpansion,
    zeroResultExpansionPending,
    cards,
    mapListings,
    mapCenter,
    searchPanelResults,
  } = useSearchResultsShell({
    search: effectiveSearch,
    navigate,
    categories: categories ?? undefined,
    allFilters,
    qDraft,
    setQDraft,
    // This page's category is fixed by the route, not derived from filter
    // state — no need to consult the resolver's own params.
    resolveCategoryId: () => selected.id,
    canRemoveCategoryInZeroResultExpansion: false,
  });

  // Merke/Modell selected in the attribute filters get appended as extra
  // brødsmuler after the category chain, matching the ad-detail page's
  // breadcrumb so the two page types read as one continuous path.
  const extraSegments = useMemo(() => {
    const attributes: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(attrValues)) {
      if (v.kind === "text" || v.kind === "select") attributes[key] = v.value;
    }
    const vehicleGroup = vehicleCategoryGroupFor(selected.id, allFilters ?? [], tree.byId);
    const genericBrandFilter = genericBrandFilterFor(selected.id, allFilters ?? [], tree.byId);
    const rootCategorySlug = breadcrumb[0]?.slug ?? category.slug;
    return getCategoryBehavior(vehicleGroup).extraBreadcrumbSegments(attributes, {
      rootCategorySlug,
      genericBrandFilter,
    });
  }, [attrValues, allFilters, tree, selected, breadcrumb, category]);

  return (
    <div>
      {/* Entries before this page's own category are real ancestor pages with
          their own URL; the page's own category and any deeper `sub`
          selection just update the search param. */}
      <CategoryHero
        selected={selected}
        main={breadcrumb[0]}
        breadcrumbEntries={breadcrumbEntries}
        extraSegments={extraSegments}
        subcategories={children}
        onSelectCategory={selectCategory}
        linkUntilIndex={breadcrumb.length - 1}
      />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="space-y-2">
          {isNative ? (
            <SearchSummaryPill
              q={qDraft}
              filterCount={activeFilterCount}
              onOpenQuery={() => openPanel("query")}
              onOpenFilters={() => openPanel("price")}
            />
          ) : (
            <SearchBar
              q={qDraft}
              onQChange={setQDraft}
              onSubmitQ={() => updateSearch({ q: qDraft })}
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              showQMode={false}
              extraGroups={search.extraGroups ?? []}
              onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
            />
          )}
          {/* Desktop web bruker SearchFilterSidebar (se under, samme som
              /annonser); denne inline-kortlayouten er kun for mobil web, der
              siden ikke har plass til en fast sidekolonne. */}
          {!isNative && !isDesktop && (
            <AttributeFilterChips
              filters={attrFilters}
              values={attrValues}
              onChange={handleAttrValueChange}
              isNative={isNative}
              resultCount={totalCount ?? cards.length}
              queryText={qDraft}
              min={search.min}
              max={search.max}
              includeFree={search.includeFree ?? true}
              onPriceChange={(mn, mx, free) =>
                updateSearch({ min: mn, max: mx, includeFree: free })
              }
              conditions={search.conditions ?? []}
              onConditionsChange={(c) =>
                updateSearch({ conditions: c as z.infer<typeof conditionEnum>[] })
              }
              counts={facetCounts}
              layout="card"
              location={location}
              onLocationChange={handleLocationChange}
              onReset={resetFilters}
            />
          )}

          {/* Native (fase 12): aktive filtertagger bor i søkepanelet nå. */}
          {!isNative && (
            <ActiveFilters
              search={search}
              terms={terms}
              onUpdate={(patch) => updateSearch(patch)}
              attrFilters={attrFilters}
              attrValues={attrValues}
              location={location}
              onRemoveLocation={() =>
                updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined })
              }
              onRemoveAttr={removeAttrWithRestore}
              justCreatedKeys={justCreatedKeys}
            />
          )}
        </div>

        <SearchResultsBody
          isNative={isNative}
          isDesktop={isDesktop}
          searchPanelResults={searchPanelResults}
          categories={categories ?? []}
        >
          <ResultList
            isNative={isNative}
            isDesktop={isDesktop}
            q={search.q}
            effectiveCategories={[selected.slug]}
            cards={cards}
            totalCount={totalCount}
            isLoading={isLoading}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={() => void fetchNextPage()}
            hasActiveCriteria={
              search.q.trim().length > 0 ||
              search.min != null ||
              search.max != null ||
              (search.conditions?.length ?? 0) > 0 ||
              Object.keys(attrValues).length > 0 ||
              search.lat != null
            }
            resetFilters={resetFilters}
            zeroResultExpansion={zeroResultExpansion}
            zeroResultExpansionPending={zeroResultExpansionPending}
            onApplyZeroResultExpansion={(expansion) => applyPanelDraft(expansion.applied)}
            mapListings={mapListings}
            mapCenter={mapCenter}
            radiusKm={search.radius ?? 10}
            onMapCenterChange={(c, label) =>
              updateSearch({ lat: c.lat, lng: c.lng, loc: label ?? "" })
            }
            onMapRadiusChange={(km) => updateSearch({ radius: km })}
            onMapClearLocation={() =>
              updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined })
            }
            onMapApplyViewport={(c, radius, label) =>
              updateSearch({ lat: c.lat, lng: c.lng, radius, loc: label ?? "" })
            }
            sort={search.sort}
            onSortChange={(s) => updateSearch({ sort: s })}
          />
        </SearchResultsBody>
      </div>
    </div>
  );
}
