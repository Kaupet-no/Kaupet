import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FolderOpen, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import { ActiveFilters } from "@/components/active-filters";
import type { MapListing } from "@/components/listings-map";
import { ResultList } from "@/components/result-list";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import {
  useRegisterSearchPanelResults,
  useSearchPanel,
} from "@/features/listing-search/search-panel/search-panel-context";
import type { SearchPanelResultsContext } from "@/features/listing-search/search-panel/search-panel";
import {
  SearchSummaryPill,
  countActiveFilters,
} from "@/features/listing-search/search-panel/search-summary-pill";
import { buildActiveFilterItems } from "@/features/listing-search/search-panel/active-filter-items";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { WtbListingCard } from "@/components/wtb-listing-card";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import { useTextToFilterPipeline } from "@/features/listing-search/use-text-to-filter-pipeline";
import {
  matchCategoryPhrase,
  matchVehicleBrandPhrase,
  matchVehicleAttributeOptionPhrase,
  removeCategoryMatch,
} from "@/lib/search-category-match";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { useBrandCategoryCandidate } from "@/features/listing-search/use-brand-category-candidate";
import { stripFillerWords } from "@/lib/search-stopwords";
import {
  normalizeFilter,
  vehicleCategoryGroupFor,
  vehicleCategoriesForBrandGroup,
  genericBrandFilterFor,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { isBilOgMcCategory } from "@/components/advanced-search-value";
import { useWtbListings } from "@/features/listing-search/use-wtb-listings";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { hapticImpact } from "@/lib/haptics";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { useFilterFacetCounts } from "@/features/listing-search/use-filter-facet-counts";
import { useHeroCategoryActions } from "@/features/listing-search/use-hero-category-actions";
import { CategoryHero, CategoryBreadcrumb } from "@/components/category-hero";
import { CategoryChipRow } from "@/components/category-chip-row";
import { BrowsePageSkeleton } from "@/components/browse-page-skeleton";
import {
  breadcrumbPath,
  resolveCategoryIds,
  resolveHeroCategory,
  type Category,
} from "@/lib/categories";

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
  const scrollDir = useScrollDirection();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser" });
  const { user } = useAuth();
  const [qDraft, setQDraft] = useState(search.q);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const { open: searchPanelOpen, openPanel } = useSearchPanel();
  const [activeTab, setActiveTab] = useState<"listings" | "wtb">("listings");
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

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: isNative && mounted && !searchPanelOpen && !saveSearchOpen,
    onRefresh: async () => {
      await queryClient.resetQueries({ queryKey: ["listings"] });
    },
  });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
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
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const { data: radiusIds } = useQuery({
    queryKey: ["listings-radius", search.lat, search.lng, search.radius],
    enabled: search.lat != null && search.lng != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listings_within_radius", {
        center_lat: search.lat!,
        center_lng: search.lng!,
        radius_km: search.radius ?? 10,
      });
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
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
    advancedInitial,
    currentCriteria,
    updateSearch,
    setLiveValue,
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

  // No Bil og MC listing has a "Tilstand" attribute, so the condition filter
  // is meaningless (and hidden) once the search narrows to that category.
  const isBilOgMc = isBilOgMcCategory(categories ?? [], effectiveCategories);

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

  // Recognizes category-attribute vocabulary (e.g. "ryggekamera") and
  // number+unit facts (e.g. "under 100000 km") typed into the search box
  // and converts them into structured attribute filters — see
  // use-text-to-filter-pipeline.ts, which coordinates both matchers in one
  // atomic pass so they can't clobber each other. Synonym matching also
  // works with no category selected (searches every category's vocabulary
  // instead of one), though number+unit matching still only runs once a
  // category is selected — see use-search-synonym-matches.ts for the
  // ambiguity trade-off this makes.
  useTextToFilterPipeline({
    qDraft,
    setQDraft,
    updateSearch,
    attrFilters,
    allFilters: allFilters ?? [],
    attrValues,
    handleAttrValueChange,
    categoryId: hero?.selected.id ?? null,
    onApplied: (applied) => {
      setAutoAppliedText((prev) => ({ ...prev, ...applied }));
      flashKeys(Object.keys(applied));
    },
  });

  // Removes an attribute filter the same way onRemoveAttr always has, but
  // first checks whether it was auto-applied from typed text (see
  // autoAppliedText above) — if so, the original word goes back into the
  // search box instead of vanishing, since the automation guessing wrong
  // shouldn't cost the user what they typed.
  const removeAttrWithRestore = (key: string, value?: string) => {
    const current = attrValues[key];
    const composite =
      value !== undefined && current?.kind === "exclude"
        ? `${key}:!${value}`
        : `${key}:${value ?? ""}`;
    const restoreText = autoAppliedText[composite];
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
      const nextQ = qDraft ? `${qDraft} ${restoreText}` : restoreText;
      setQDraft(nextQ);
      updateSearch({ q: nextQ });
    }
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
  const { data: vehicleBrands } = useAllVehicleBrands();
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

  // Always the main category's own direct children — not `hero.selected`'s,
  // which can drill deeper than the root once a single subcategory narrows
  // the selection. Keeping this anchored to the root is what makes selecting
  // several sibling subcategories at once possible (see
  // isHeroChildActive/toggleChildCategory below).
  const heroSubcategories = hero ? (categoryTree.childrenByParent.get(hero.main.id) ?? []) : [];

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

  // Only animate the hero in when it appears in response to the user picking a
  // category — arriving with one already in the URL (deep link, or the
  // homepage's category picker) should paint it as part of the page.
  const [animateHero, setAnimateHero] = useState(false);
  // Keyed on the main category, not `hero.selected` — the hero's own title no
  // longer follows the narrower category, so re-animating on every
  // subcategory toggle would be pointless motion.
  const heroSelectedId = hero?.main.id ?? null;
  // `undefined` = the state the page was first rendered in, which is whatever
  // the URL asked for and therefore never animates.
  const prevHeroId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!mounted || !categories) return;
    const prev = prevHeroId.current;
    prevHeroId.current = heroSelectedId;
    if (prev === undefined) return;
    setAnimateHero(heroSelectedId != null && heroSelectedId !== prev);
  }, [mounted, categories, heroSelectedId]);

  const { selectHeroCategory, selectRootCategory, toggleChildCategory, isHeroChildActive } =
    useHeroCategoryActions({ hero, categoryTree, effectiveCategories, updateSearch });

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

  const {
    data: listingsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListingsQuery({ search, categories, effectiveCategories, terms, radiusIds });

  const listings = useMemo(() => listingsData?.pages.flatMap((p) => p.rows), [listingsData]);
  const totalCount = listingsData?.pages[0]?.totalCount ?? null;

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

  // The panel now lives globally (fase 12) — this page just hands it its
  // live filter state instead of mounting its own instance. `null` on web
  // (no bottom-nav entry point there) keeps the global panel out of
  // launch-mode fallback while this page is showing.
  const searchPanelResults: SearchPanelResultsContext | null = isNative
    ? {
        q: search.q,
        value: advancedInitial,
        setValue: setLiveValue,
        onSubmitText: (q) => {
          setQDraft(q);
          updateSearch({ q });
        },
        onSelectCategory: (slug) => updateSearch({ category: slug, categories: [] }),
        location,
        onLocationChange: handleLocationChange,
        attributeFilters: attrFilters,
        attributeValues: attrValues,
        onAttributeChange: handleAttrValueChange,
        attributeCounts: facetCounts,
        resultCount: totalCount ?? cards.length,
        activeItems: buildActiveFilterItems({
          search,
          terms,
          onUpdate: (patch) => updateSearch(patch),
          attrFilters,
          attrValues,
          onRemoveAttr: removeAttrWithRestore,
          location,
          onRemoveLocation: () =>
            updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined }),
        }),
        onResetAll: resetFilters,
        criteria: currentCriteria,
        defaultName: summarizeCriteria(currentCriteria),
      }
    : null;
  useRegisterSearchPanelResults(searchPanelResults);

  if (!mounted) {
    return <BrowsePageSkeleton />;
  }

  return (
    <div>
      <NativePageHeader title="Annonser" hideBack />

      {isNative && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />}

      {/* Native (fase 12): kategorivalg og -filtrering skjer i søkepanelet nå,
          så den fargede heroen og chip-raden er borte — bare en enkel
          brødsmule viser hvor brukeren er. Web beholder heroen/chip-raden. */}
      {isNative ? (
        hero && (
          <div className="px-4 pt-2">
            <CategoryBreadcrumb
              breadcrumbEntries={heroBreadcrumb}
              extraSegments={heroExtraSegments}
              onSelectCategory={selectHeroCategory}
            />
          </div>
        )
      ) : hero ? (
        <CategoryHero
          selected={hero.main}
          main={hero.main}
          breadcrumbEntries={heroBreadcrumb}
          extraSegments={heroExtraSegments}
          subcategories={heroSubcategories}
          onSelectCategory={selectHeroCategory}
          subcategorySelection={{
            isActive: isHeroChildActive,
            onToggle: (c) => toggleChildCategory(hero.main, c),
          }}
          headingAs="h1"
          animateIn={animateHero}
        />
      ) : (
        <div className="mx-auto max-w-7xl px-4 pt-6">
          <CategoryChipRow tree={categoryTree} onSelectRoot={selectRootCategory} isNative={false} />
        </div>
      )}

      <div
        className={`mx-auto max-w-7xl px-4 ${isNative ? "pt-2 pb-8" : "pb-8 pt-3 md:pb-10 md:pt-4"}`}
      >
        {!isNative && !hero && <h1 className="font-display text-3xl tracking-tight">Annonser</h1>}

        <div
          className={
            isNative
              ? `sticky top-0 z-40 -mx-4 space-y-2 px-4 pb-2 pt-safe transition-all duration-200 bg-background/95 backdrop-blur ${scrollDir === "down" ? "shadow-sm" : ""}`
              : "mt-6 space-y-2"
          }
        >
          {/* Native: én kompakt sammendrag-pille i stedet for søkelinje +
              chip-rad (fase 9, tiltak 26). Den viser hva som er aktivt og er
              inngangen til søkepanelet; ActiveFilters under viser detaljene. */}
          {isNative && (
            <SearchSummaryPill
              q={qDraft}
              onQChange={setQDraft}
              onSubmitQ={() => {
                void hapticImpact("medium");
                if (categoryMatch) applyCategoryMatch();
                else updateSearch({ q: qDraft });
              }}
              filterCount={activeFilterCount}
              onOpen={() => openPanel("categories")}
            />
          )}
          {!isNative && (
            <SearchBar
              q={qDraft}
              onQChange={setQDraft}
              onSubmitQ={() => {
                void hapticImpact("medium");
                // Pressing Enter with a pending category match confirms it
                // (same action as clicking the suggestion chip below)
                // instead of running a plain text search for it.
                if (categoryMatch) applyCategoryMatch();
                else updateSearch({ q: qDraft });
              }}
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              showQMode={false}
              extraGroups={search.extraGroups ?? []}
              onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
            />
          )}
          {categoryMatch && (
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
          {isNative ? null : (
            <>
              {effectiveCategories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Velg en kategori for å se flere søkefilter
                </p>
              )}
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
                hideCondition={isBilOgMc}
                hasCategory={effectiveCategories.length > 0}
                counts={facetCounts}
                layout="card"
                location={location}
                onLocationChange={handleLocationChange}
                onReset={resetFilters}
                moreFilterHref
              />
            </>
          )}

          {/* Native (fase 12): aktive filtertagger bor i søkepanelet nå (med
              swipe-for-å-fjerne), så denne raden er web-only. */}
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

        {user && (
          <SaveSearchDialog
            open={saveSearchOpen}
            onOpenChange={setSaveSearchOpen}
            defaultName={summarizeCriteria(currentCriteria)}
            criteria={currentCriteria}
            onSaved={() => setSaveSearchOpen(false)}
          />
        )}

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
            onClearCategoryFilter={
              effectiveCategories.length > 0
                ? () => updateSearch({ category: "", categories: [] })
                : undefined
            }
            onDropLastWord={(nextQ) => {
              setQDraft(nextQ);
              updateSearch({ q: nextQ });
            }}
            attrFilters={attrFilters}
            attrValues={attrValues}
            onRemoveAttr={(key) => removeAttrWithRestore(key)}
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
              user && !isNative ? (
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
      </div>
    </div>
  );
}
