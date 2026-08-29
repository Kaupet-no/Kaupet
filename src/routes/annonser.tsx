import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Save, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import { ActiveFilters } from "@/components/active-filters";
import { ResultList } from "@/components/result-list";
import { SearchResultsBody } from "@/features/listing-search/search-panel/search-results-body";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { SearchSummaryPill } from "@/features/listing-search/search-panel/search-summary-pill";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { WtbListingCard } from "@/components/wtb-listing-card";
import { searchSchema } from "@/features/listing-search/search-schema";
import { useSearchResultsShell } from "@/features/listing-search/use-search-results-shell";
import { SearchInterpretation } from "@/features/listing-search/search-interpretation";
import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";
import {
  buildStructuredSearchSuggestions,
  type StructuredSearchSuggestion,
} from "@/features/listing-search/structured-search-suggestions";
import {
  matchCategoryPhrase,
  matchVehicleBrandPhrase,
  matchVehicleAttributeOptionPhrase,
  removeCategoryMatch,
} from "@/lib/search-category-match";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { useBrandCategoryCandidate } from "@/features/listing-search/use-brand-category-candidate";
import { stripFillerWords } from "@/lib/search-stopwords";
import { parseNumericFilters } from "@/lib/search-number-parser";
import {
  normalizeFilter,
  vehicleCategoryGroupFor,
  vehicleCategoriesForBrandGroup,
  genericBrandFilterFor,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { useWtbListings } from "@/features/listing-search/use-wtb-listings";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative } from "@/hooks/use-is-native";
import { useIsDesktop } from "@/hooks/use-form-factor";
import { NativePageHeader } from "@/components/native-page-header";
import { hapticImpact } from "@/lib/haptics";
import { trackProductEvent } from "@/lib/product-analytics";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { useHeroCategoryActions } from "@/features/listing-search/use-hero-category-actions";
import { CategoryBreadcrumb } from "@/components/category-hero";
import { BrowsePageSkeleton } from "@/components/browse-page-skeleton";
import { breadcrumbPath, resolveHeroCategory, type Category } from "@/lib/categories";
import { submitSearch } from "@/features/listing-search/submit-search";

export const Route = createFileRoute("/annonser")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alle annonser — brukte ting til salgs i Norge | Kaupet.no" },
      {
        name: "description",
        content:
          "Søk og bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris, tilstand og lokasjon på Kaupet.no.",
      },
      { property: "og:title", content: "Alle annonser — Kaupet.no" },
      {
        property: "og:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kaupet.no/annonser" },
      { name: "twitter:title", content: "Alle annonser — Kaupet.no" },
      {
        name: "twitter:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
    ],
    links: [{ rel: "canonical", href: "https://kaupet.no/annonser" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Alle annonser på Kaupet.no",
          description:
            "Brukte ting til salgs i Norge. Søkbar katalog med filtre for kategori, pris, tilstand og lokasjon.",
          url: "https://kaupet.no/annonser",
          inLanguage: "nb-NO",
          isPartOf: { "@id": "https://kaupet.no/#website" },
        }),
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const isNative = useIsNative();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser" });
  const { user } = useAuth();
  const [qDraft, setQDraft] = useState(search.q);
  const [mounted, setMounted] = useState(false);
  const searchPageViewTracked = useRef(false);
  const isDesktop = useIsDesktop();
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const { open: searchPanelOpen, openPanel } = useSearchPanel();
  const [activeTab, setActiveTab] = useState<"listings" | "wtb">("listings");
  const [interpretedCriteria, setInterpretedCriteria] = useState<InterpretedCriterion[]>([]);
  const [ignoredInterpretations, setIgnoredInterpretations] = useState<Set<string>>(new Set());

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: isNative && mounted && !searchPanelOpen && !saveSearchOpen,
    onRefresh: async () => {
      await queryClient.resetQueries({ queryKey: ["listings"] });
    },
  });

  useEffect(() => setMounted(true), []);
  useEffect(() => setQDraft(search.q), [search.q]);

  // Same key/shape as the category landing pages so the two share one cache —
  // `color`/`icon`/`heading_font` are what the category hero presents with.
  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color, heading_font")
        .eq("is_hidden", false)
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

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
    resetFilters: resetSearchFilters,
    justCreatedKeys,
    removeAttrWithRestore,
    activeFilterCount,
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
  } = useSearchResultsShell({
    search,
    navigate,
    categories,
    allFilters,
    qDraft,
    setQDraft,
    // See resolveHeroCategory below — the hero is recomputed from this same
    // effectiveCategories/categoryTree pair right after this call, since the
    // shell needs a resolved category id before it can even know `hero`.
    resolveCategoryId: (ec, tree) => resolveHeroCategory(ec, tree)?.selected.id ?? null,
    canRemoveCategoryInZeroResultExpansion: true,
    onInterpreted: setInterpretedCriteria,
    ignoredInterpretations,
    markIgnored: (restoredText) =>
      setIgnoredInterpretations(
        (previous) => new Set([...previous, restoredText.toLocaleLowerCase()]),
      ),
  });

  // When the category filter narrows the results down to a single main-category
  // branch, the page presents itself like that category's own landing page —
  // "/Kategori" over the category's color, with its subcategories to drill
  // into — so a search that started out category-less still shows which
  // category the user ended up in.
  const hero = useMemo(
    () => resolveHeroCategory(effectiveCategories, categoryTree),
    [effectiveCategories, categoryTree],
  );
  // Always just the main category — not `hero.selected`, which can drill
  // deeper as subcategories narrow the selection. With multi-select
  // subcategories, `selected` is whichever one happened to be picked most
  // recently, so a title that followed it would flip around confusingly;
  // the main category's own name stays stable no matter how many (or which)
  // subcategories are toggled.
  const heroBreadcrumb = useMemo(
    () => (hero ? breadcrumbPath(hero.main, categoryTree) : []),
    [hero, categoryTree],
  );
  const interpretedKeys = useMemo(
    () =>
      new Set(
        interpretedCriteria
          .filter(
            (criterion): criterion is Extract<InterpretedCriterion, { kind: "attribute" }> =>
              criterion.kind === "attribute",
          )
          .map((criterion) => criterion.key),
      ),
    [interpretedCriteria],
  );
  const activeAttrValues = useMemo(
    () =>
      Object.fromEntries(Object.entries(attrValues).filter(([key]) => !interpretedKeys.has(key))),
    [attrValues, interpretedKeys],
  );
  const resetFilters = () => {
    setInterpretedCriteria([]);
    setIgnoredInterpretations(new Set());
    resetSearchFilters();
  };

  // Recognizes a category name typed as a whole phrase (e.g. "mobiltelefon")
  // and applies it as the category filter — the same action as clicking the
  // "Gå til kategori" suggestion in SearchBar, just without requiring the
  // click. See search-category-match.ts. Only on /annonser: category
  // landing pages are already scoped to one category, so auto-navigating
  // away based on typed text there would be surprising rather than helpful.
  // A category match is confirmed (click or Enter) rather than applied the
  // instant it's recognized — unlike the attribute/number matches above, it
  // triggers a full page navigation (new hero, new breadcrumb), which is too
  // disruptive to fire mid-sentence while the user is still typing. Tracking
  // `dismissedMatchText` keeps a closed suggestion closed for that exact
  // phrase instead of it reappearing on every keystroke.
  const [dismissedMatchText, setDismissedMatchText] = useState<string | null>(null);
  // Vehicle brand names ("Volvo") don't match any category name, so without
  // this a query like "Volvo med cruisecontrol" never gets a category
  // assigned — and the equipment-synonym matcher above requires one to scope
  // its vocabulary lookup, so "cruisecontrol" would just fall through to a
  // plain text search that finds nothing. See matchVehicleBrandPhrase.
  const advancedSearchCount = (search.extraGroups?.length ?? 0) + (search.qMode === "any" ? 1 : 0);
  const { data: vehicleBrands } = useAllVehicleBrands();
  const submitQuery = () => {
    void hapticImpact("medium");
    trackProductEvent("search_submitted", {
      source: "search_bar",
      hasText: qDraft.trim().length > 0,
      hasCategory: effectiveCategories.length > 0,
      filterCount: activeFilterCount,
    });
    void submitSearch({
      applied: appliedSearch,
      query: qDraft,
      categories: categories ?? [],
      vehicleBrands: vehicleBrands ?? [],
      allFilters: allFilters ?? [],
      commit: (next) => {
        setQDraft(next.q);
        navigate({ search: next, resetScroll: false });
      },
    });
  };
  const rawCategoryMatch = useMemo(() => {
    const m =
      matchCategoryPhrase(qDraft, categories ?? []) ??
      matchVehicleBrandPhrase(qDraft, vehicleBrands ?? []) ??
      matchVehicleAttributeOptionPhrase(qDraft, allFilters ?? [], categories ?? []);
    return m && m.matchedText !== dismissedMatchText ? m : null;
  }, [qDraft, categories, vehicleBrands, allFilters, dismissedMatchText]);

  // For a brand match, resolve the "Bil og MC" root fallback from
  // matchVehicleBrandPhrase down to the actual subcategory (e.g. "Bil") the
  // brand's category_group implies — computed live from the category tree
  // (vehicleCategoriesForBrandGroup) rather than a hardcoded slug table, so
  // it survives category-tree restructuring. Some groups (moped_atv,
  // bobil_campingvogn) now span two categories after being split, so those
  // need useBrandCategoryCandidate to pick the one with more matching
  // listings for the current query.
  const brandCategoryCandidates = useMemo(() => {
    if (rawCategoryMatch?.source !== "brand" || !rawCategoryMatch.brandCategoryGroup) return [];
    return vehicleCategoriesForBrandGroup(
      rawCategoryMatch.brandCategoryGroup,
      categories ?? [],
      allFilters ?? [],
      categoryTree.byId,
    );
  }, [rawCategoryMatch, categories, allFilters, categoryTree]);
  const { candidate: brandCategoryCandidate, isLoading: brandCategoryCandidateLoading } =
    useBrandCategoryCandidate(brandCategoryCandidates, qDraft);

  const categoryMatch = useMemo(() => {
    if (!rawCategoryMatch) return null;
    if (rawCategoryMatch.source !== "brand" || brandCategoryCandidates.length === 0) {
      return rawCategoryMatch;
    }
    // Ambiguous group (2+ candidates): wait for the count comparison before
    // showing the banner, so it doesn't first suggest "Bil og MC" and then
    // jump to the resolved subcategory under the user.
    if (brandCategoryCandidateLoading) return null;
    if (!brandCategoryCandidate) return rawCategoryMatch;
    return {
      ...rawCategoryMatch,
      categorySlug: brandCategoryCandidate.slug,
      categoryName: brandCategoryCandidate.name_nb,
    };
  }, [
    rawCategoryMatch,
    brandCategoryCandidates,
    brandCategoryCandidateLoading,
    brandCategoryCandidate,
  ]);

  const applyCategoryMatch = () => {
    if (!categoryMatch) return;
    // Brand matches ("Volvo") stay in the query — they're still a useful
    // title-search term — unlike category-name matches, which are redundant
    // once the category filter itself exists.
    const nextQ =
      categoryMatch.source === "category"
        ? stripFillerWords(removeCategoryMatch(qDraft, categoryMatch))
        : qDraft;
    setQDraft(nextQ);
    updateSearch({
      category: "",
      categories: [categoryMatch.categorySlug],
      catMode: "any",
      q: nextQ,
    });
    // Brand matches keep the brand name in the query, so without this the
    // banner would immediately reappear for the same text after the
    // category filter is applied — dismiss it explicitly instead.
    setDismissedMatchText(categoryMatch.matchedText);
  };
  const applyStructuredFilterSuggestion = (suggestion: StructuredSearchSuggestion) => {
    const current = attrValues[suggestion.filterKey];
    const value =
      suggestion.value.kind === "multiselect" && current?.kind === "multiselect"
        ? {
            kind: "multiselect" as const,
            values: [...new Set([...current.values, ...suggestion.value.values])],
          }
        : suggestion.value;
    handleAttrValueChange(suggestion.filterKey, value);
    const escaped = suggestion.matchedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextQ = stripFillerWords(qDraft.replace(new RegExp(`\\b${escaped}\\b`, "i"), " "));
    setQDraft(nextQ);
    updateSearch({ q: nextQ });
  };
  const structuredFilterSuggestions = buildStructuredSearchSuggestions(
    qDraft,
    attrFilters,
    attrValues,
  ).map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.label,
    onSelect: () => applyStructuredFilterSuggestion(suggestion),
  }));
  const filterSuggestions = [
    ...structuredFilterSuggestions,
    ...parseNumericFilters(qDraft, attrFilters).map((match) => {
      const filter = attrFilters.find((candidate) => candidate.key === match.filterKey);
      const value =
        match.min != null && match.max != null
          ? `${match.min.toLocaleString("nb-NO")}–${match.max.toLocaleString("nb-NO")}`
          : match.min != null
            ? `fra ${match.min.toLocaleString("nb-NO")}`
            : `opptil ${match.max?.toLocaleString("nb-NO") ?? ""}`;
      return {
        id: `${match.filterKey}:${match.matchedText}`,
        label: `${filter?.label_nb ?? match.filterKey}: ${value}`,
        onSelect: submitQuery,
      };
    }),
  ];

  // Merke/Modell selected in the attribute filters get appended as extra
  // brødsmuler after the category chain, matching the ad-detail page's
  // breadcrumb so the two page types read as one continuous path.
  const heroExtraSegments = useMemo(() => {
    if (!hero) return [];
    const attributes: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(attrValues)) {
      if (v.kind === "text" || v.kind === "select") attributes[key] = v.value;
    }
    const vehicleGroup = vehicleCategoryGroupFor(
      hero.selected.id,
      allFilters ?? [],
      categoryTree.byId,
    );
    const genericBrandFilter = genericBrandFilterFor(
      hero.selected.id,
      allFilters ?? [],
      categoryTree.byId,
    );
    const rootCategorySlug = hero.main?.slug ?? hero.selected.slug;
    return getCategoryBehavior(vehicleGroup).extraBreadcrumbSegments(attributes, {
      rootCategorySlug,
      genericBrandFilter,
    });
  }, [hero, attrValues, allFilters, categoryTree]);

  const { selectHeroCategory } = useHeroCategoryActions({
    hero,
    categoryTree,
    effectiveCategories,
    updateSearch,
  });

  useEffect(() => {
    if (!mounted) return;
    const categoryNames = effectiveCategories
      .map((slug: string) => categories?.find((c) => c.slug === slug)?.name_nb)
      .filter((n: string | undefined): n is string => !!n);
    let label = "annonser";
    if (search.q) {
      label = `søket «${search.q}»`;
    } else if (categoryNames.length === 1) {
      label = categoryNames[0];
    } else if (categoryNames.length > 1) {
      label = "valgte kategorier";
    }
    saveLastSearchContext({ search, label });
  }, [mounted, search, effectiveCategories, categories]);

  const { wtbCount, wtbLoading, wtbListings, hasSearchCriteria } = useWtbListings({
    q: search.q,
    effectiveCategories,
    categories,
    activeTab,
  });

  // Reset to listings tab when search criteria change
  useEffect(() => {
    setActiveTab("listings");
  }, [search.q, search.category, search.categories]);

  useEffect(() => {
    if (!mounted || searchPageViewTracked.current) return;
    searchPageViewTracked.current = true;
    trackProductEvent("search_page_viewed", {
      hasText: search.q.trim().length > 0,
      hasCategory: effectiveCategories.length > 0,
      filterCount: activeFilterCount,
      source: "route",
    });
  }, [mounted, activeFilterCount, effectiveCategories.length, search.q]);

  if (!mounted) {
    return <BrowsePageSkeleton />;
  }

  return (
    <div>
      <NativePageHeader title="Annonser" hideBack />

      {isNative && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />}

      <div
        className={`mx-auto w-full px-4 ${
          isNative ? "max-w-6xl pb-8 pt-2" : "max-w-[1600px] pb-8 pt-3 md:pb-10 md:pt-4"
        }`}
      >
        {/* Kategorivalg og -filtrering skjer i søkepanelet, så vi trenger ikke
            en egen hero med chip-rad her — bare en enkel brødsmule viser hvor
            brukeren er. Rendres i samme slot som "Annonser"-tittelen (i stedet
            for som en egen rad over) så valg av hovedkategori ikke skyver
            resten av siden nedover. */}
        {hero ? (
          <CategoryBreadcrumb
            breadcrumbEntries={heroBreadcrumb}
            extraSegments={heroExtraSegments}
            onSelectCategory={selectHeroCategory}
          />
        ) : (
          !isNative && <h1 className="font-display text-3xl tracking-tight">Annonser</h1>
        )}

        <div className={isNative ? "space-y-2" : "mt-6 space-y-2"}>
          {/* Ett søkefelt er hovedinngangen. Kategorier og sekundære filter
              åpnes fra den samme filterhandlingen i stedet for å ta plass
              permanent over resultatene. */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {isNative ? (
                <SearchSummaryPill
                  q={qDraft}
                  onQChange={(q) => {
                    setInterpretedCriteria([]);
                    setIgnoredInterpretations(new Set());
                    setQDraft(q);
                  }}
                  onSubmitQ={submitQuery}
                  filterCount={activeFilterCount}
                  onOpen={() => {
                    trackProductEvent("search_filter_opened", {
                      section: "categories",
                      source: "summary",
                      filterCount: activeFilterCount,
                    });
                    openPanel("categories");
                  }}
                />
              ) : (
                <>
                  <SearchBar
                    q={qDraft}
                    onQChange={(q) => {
                      setInterpretedCriteria([]);
                      setIgnoredInterpretations(new Set());
                      setQDraft(q);
                    }}
                    onSubmitQ={submitQuery}
                    qMode={search.qMode}
                    onQModeChange={(m) => updateSearch({ qMode: m })}
                    showQMode={false}
                    categorySuggestion={
                      categoryMatch
                        ? {
                            label: `Begrens søket til ${categoryMatch.categoryName}`,
                            onSelect: applyCategoryMatch,
                          }
                        : undefined
                    }
                    filterSuggestions={filterSuggestions}
                  />
                  {!isDesktop && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        trackProductEvent("search_filter_opened", {
                          section: "search",
                          source: "advanced_search",
                          filterCount: activeFilterCount,
                        });
                        openPanel("search");
                      }}
                    >
                      <SlidersHorizontal className="size-3.5" aria-hidden />
                      Flere søkevalg
                      {advancedSearchCount > 0 ? ` · ${advancedSearchCount}` : ""}
                    </Button>
                  )}
                </>
              )}
            </div>
            {/* Desktop har filtrene stående i sidekolonnen — ingen knapp som
                åpner en dialog over dem. */}
            {!isNative && !isDesktop && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 gap-1.5 rounded-full px-3"
                onClick={() => {
                  trackProductEvent("search_filter_opened", {
                    section: "categories",
                    source: "filter_button",
                    filterCount: activeFilterCount,
                  });
                  openPanel("categories");
                }}
                aria-label={
                  activeFilterCount > 0
                    ? `Filtrer, ${activeFilterCount} aktive`
                    : "Filtrer annonser"
                }
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline">
                  Filtrer{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
                </span>
              </Button>
            )}
          </div>
        </div>
        {!isNative && !isDesktop && !search.q.trim() && activeFilterCount === 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Start med</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full bg-muted px-3"
              onClick={() => openPanel("categories")}
            >
              Velg kategori
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full bg-muted px-3"
              onClick={() => openPanel("location")}
            >
              Nær meg
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full bg-muted px-3"
              onClick={() => updateSearch({ max: 1000 })}
            >
              Under 1 000 kr
            </Button>
          </div>
        )}
        {interpretedCriteria.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-card/50 px-3 py-2">
            <SearchInterpretation
              criteria={interpretedCriteria}
              categories={categories ?? []}
              filters={attrFilters.length > 0 ? attrFilters : (allFilters ?? [])}
              onCategoryChange={() => undefined}
              onAttributeChange={(key) => {
                const criterion = interpretedCriteria.find(
                  (item) => item.kind === "attribute" && item.key === key,
                );
                setInterpretedCriteria((previous) =>
                  previous.filter((item) => item.kind !== "attribute" || item.key !== key),
                );
                removeAttrWithRestore(key, undefined, criterion?.matchedText);
              }}
              onAttributeRemove={(key, value, matchedText) => {
                const criterion = interpretedCriteria.find(
                  (item) =>
                    item.kind === "attribute" &&
                    item.key === key &&
                    (value == null ||
                      (item.value.kind === "multiselect" || item.value.kind === "exclude"
                        ? item.value.values.includes(value)
                        : true)),
                );
                setInterpretedCriteria((previous) =>
                  previous.filter((item) => item.kind !== "attribute" || item.key !== key),
                );
                removeAttrWithRestore(key, value, matchedText ?? criterion?.matchedText);
              }}
            />
          </div>
        )}
        {categoryMatch && isNative && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <FolderOpen className="size-4 shrink-0 text-primary" />
            <button
              type="button"
              onClick={applyCategoryMatch}
              className="flex-1 text-left underline-offset-2 hover:underline"
            >
              Begrens søket til{" "}
              <span className="font-medium text-primary">{categoryMatch.categoryName}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedMatchText(categoryMatch.matchedText)}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Ikke nå"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {!isNative && (
          <div className="flex flex-wrap items-center gap-2">
            <ActiveFilters
              search={search}
              terms={terms}
              onUpdate={(patch) => updateSearch(patch)}
              attrValues={activeAttrValues}
              attrFilters={attrFilters}
              location={location}
              onRemoveLocation={() =>
                updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined })
              }
              onRemoveAttr={removeAttrWithRestore}
              justCreatedKeys={justCreatedKeys}
            />
          </div>
        )}

        {user && (
          <SaveSearchDialog
            open={saveSearchOpen}
            onOpenChange={setSaveSearchOpen}
            defaultName={summarizeCriteria(currentCriteria)}
            criteria={currentCriteria}
            onSaved={() => setSaveSearchOpen(false)}
          />
        )}

        {/* Desktop: filtrene står permanent til venstre for treffene i stedet
          for i en dialog over dem (se SearchFilterSidebar). */}
        <SearchResultsBody
          isNative={isNative}
          isDesktop={isDesktop}
          searchPanelResults={searchPanelResults}
          categories={categories ?? []}
          onSaveSearch={user ? () => setSaveSearchOpen(true) : undefined}
        >
          <>
            {/* ØK-tab — vises kun når søkkriterier gir treff */}
            {hasSearchCriteria && wtbCount > 0 && (
              <div className="mt-4 flex gap-2" role="tablist" aria-label="Annonsetype">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "listings"}
                  onClick={() => setActiveTab("listings")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "listings"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Til salgs
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "wtb"}
                  onClick={() => setActiveTab("wtb")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "wtb"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Ønskes kjøpt ({wtbCount})
                </button>
              </div>
            )}

            {activeTab === "wtb" ? (
              <div className="mt-4">
                {wtbLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : wtbListings.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
                    <p className="text-lg font-medium">Ingen ønskes kjøpt-annonser funnet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ingen etterspør dette akkurat nå. Prøv et bredere søk.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {wtbListings.map((w) => (
                      <WtbListingCard key={w.id} listing={w} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <ResultList
                isNative={isNative}
                isDesktop={isDesktop}
                q={search.q}
                effectiveCategories={effectiveCategories}
                cards={cards}
                totalCount={totalCount}
                isLoading={isLoading}
                hasNextPage={!!hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={() => void fetchNextPage()}
                resetFilters={resetFilters}
                zeroResultExpansion={zeroResultExpansion}
                zeroResultExpansionPending={zeroResultExpansionPending}
                zeroResultExpansions={zeroResultExpansions}
                onApplyZeroResultExpansion={(expansion) => {
                  trackProductEvent("search_zero_results_recovered", {
                    source: "zero_result_recovery",
                    resultCount: expansion.count,
                  });
                  applyPanelDraft(expansion.applied);
                }}
                mapListings={mapListings}
                mapCenter={mapCenter}
                radiusKm={search.radius ?? 10}
                onMapCenterChange={(c, label) =>
                  updateSearch({ lat: c.lat, lng: c.lng, loc: label ?? "" })
                }
                onMapRadiusChange={(km) => updateSearch({ radius: km })}
                onMapClearLocation={() =>
                  updateSearch({
                    lat: undefined,
                    lng: undefined,
                    radius: undefined,
                    loc: undefined,
                  })
                }
                sort={search.sort}
                onSortChange={(s) => updateSearch({ sort: s })}
                // Native (fase 12): "Lagre søk" flyttet inn i søkepanelet.
                toolbarExtra={
                  // Desktop har «Lagre søk» nederst i filterkolonnen.
                  user && !isNative && !isDesktop && hasSearchCriteria ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSaveSearchOpen(true)}
                      className="gap-1.5"
                    >
                      <Save className="size-4" /> Lagre søk
                    </Button>
                  ) : undefined
                }
              />
            )}
          </>
        </SearchResultsBody>
      </div>
    </div>
  );
}
