import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import { DesktopFilterChips } from "@/components/desktop-filter-chips";
import { ActiveFilters } from "@/components/active-filters";
import type { MapListing } from "@/components/listings-map";
import { ResultList } from "@/components/result-list";
import { NativeFilterChips } from "@/components/native-filter-chips";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import { FilterHintBanner } from "@/components/filter-hint-banner";
import { NativeSearchOverlay } from "@/components/native-search-overlay";
import { NativeAdvancedSearch } from "@/components/native-advanced-search";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { WtbListingCard } from "@/components/wtb-listing-card";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import {
  normalizeFilter,
  vehicleCategoryGroupFor,
  genericBrandFilterFor,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { useWtbListings } from "@/features/listing-search/use-wtb-listings";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { hapticImpact } from "@/lib/haptics";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { CategoryHero } from "@/components/category-hero";
import { CategoryChipRow } from "@/components/category-chip-row";
import {
  breadcrumbPath,
  resolveHeroCategory,
  selectAllForParent,
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
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [advancedOverlayOpen, setAdvancedOverlayOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"listings" | "wtb">("listings");

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: isNative && mounted,
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
    handleApply,
    handleLocationChange,
    resetFilters,
  } = useAnnonserSearchState({ search, navigate, categories, allFilters, setQDraft });

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

  // Selecting a category inside the hero keeps the user on /annonser, so the
  // query text and every other filter in the URL survive. Descendants are
  // listed explicitly because the listings query only expands *root*
  // categories one level (see use-listings-query.ts).
  const selectHeroCategory = (target: Category) =>
    updateSearch({
      category: "",
      categories: selectAllForParent(target, categoryTree),
      catMode: "any",
    });

  // Always-visible category row above the search bar: tapping a main
  // category selects its whole branch immediately (same as selectHeroCategory
  // above); tapping a subcategory narrows to just that branch, toggling it
  // off again falls back to the whole main category.
  const selectRootCategory = (root: Category) => {
    const alreadyActive = effectiveCategories.some((slug) =>
      selectAllForParent(root, categoryTree).includes(slug),
    );
    updateSearch({
      category: "",
      categories: alreadyActive ? [] : selectAllForParent(root, categoryTree),
      catMode: "any",
    });
  };

  const toggleChildCategory = (root: Category, child: Category) => {
    const selected = new Set(effectiveCategories);
    const wholeBranch = selectAllForParent(root, categoryTree);
    const wholeBranchSelected = wholeBranch.every((slug) => selected.has(slug));
    const childBranch = selectAllForParent(child, categoryTree);
    const childActive = !wholeBranchSelected && childBranch.every((slug) => selected.has(slug));

    let next: string[];
    if (wholeBranchSelected) {
      // Narrowing from "everything in this main category" to just this child.
      next = childBranch;
    } else if (childActive) {
      // Deselecting this child — fall back to the whole branch if nothing
      // else is explicitly selected.
      const remaining = effectiveCategories.filter((slug) => !childBranch.includes(slug));
      next = remaining.length === 0 ? wholeBranch : remaining;
    } else {
      next = [...new Set([...effectiveCategories, ...childBranch])];
    }
    updateSearch({ category: "", categories: next, catMode: "any" });
  };

  const isHeroChildActive = (child: Category) => {
    if (!hero) return false;
    const wholeBranchSelected = selectAllForParent(hero.main, categoryTree).every((slug) =>
      effectiveCategories.includes(slug),
    );
    if (wholeBranchSelected) return false;
    return selectAllForParent(child, categoryTree).every((slug) =>
      effectiveCategories.includes(slug),
    );
  };

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

  if (!mounted) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10" aria-busy="true" aria-live="polite">
        <h1 className="font-display text-3xl tracking-tight">Annonser</h1>
        <span className="sr-only">Laster…</span>
        <div className="mt-6 h-14 w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border p-3">
                <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-24 h-[calc(100vh-8rem)] w-full animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isNative && (pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-150"
          style={{ height: refreshing ? 48 : Math.min(pullDistance, 48) }}
        >
          <div
            className={`size-6 rounded-full border-2 border-primary border-t-transparent ${refreshing ? "animate-spin" : ""}`}
            style={{ opacity: refreshing ? 1 : pullDistance / 64 }}
          />
        </div>
      )}
      <NativePageHeader title="Annonser" hideBack />

      {/* Hero zone: before a category is picked this shows the always-visible
          main-category chip row; picking one brings in CategoryHero in this
          same spot (its own subcategory row takes over narrowing further). */}
      {hero ? (
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
          compact={isNative}
          headingAs={isNative ? "p" : "h1"}
          animateIn={animateHero}
        />
      ) : (
        <div className={isNative ? "px-4 pt-2" : "mx-auto max-w-7xl px-4 pt-6"}>
          <CategoryChipRow
            tree={categoryTree}
            onSelectRoot={selectRootCategory}
            isNative={isNative}
          />
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
          {/* On native: tap on the search bar opens the full-screen search overlay */}
          {isNative && (
            <div className="relative">
              <SearchBar
                q={qDraft}
                onQChange={setQDraft}
                onSubmitQ={() => {
                  void hapticImpact("medium");
                  updateSearch({ q: qDraft });
                }}
                selectedSlugs={[]}
                onSelectedChange={() => {}}
                categories={categories ?? []}
                qMode={search.qMode}
                onQModeChange={(m) => updateSearch({ qMode: m })}
                showQMode={false}
              />
              <button
                type="button"
                className="absolute inset-0 z-10"
                onClick={() => {
                  void hapticImpact("light");
                  setSearchOverlayOpen(true);
                }}
                aria-label="Åpne søk"
              />
            </div>
          )}
          {!isNative && (
            <SearchBar
              q={qDraft}
              onQChange={setQDraft}
              onSubmitQ={() => {
                void hapticImpact("medium");
                updateSearch({ q: qDraft });
              }}
              selectedSlugs={
                search.category
                  ? [
                      search.category,
                      ...search.categories.filter((s: string) => s !== search.category),
                    ]
                  : search.categories
              }
              onSelectedChange={(slugs) =>
                updateSearch({ category: "", categories: slugs, catMode: "any" })
              }
              categories={categories ?? []}
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              showQMode={false}
            />
          )}
          <FilterHintBanner hasActiveCriteria={hasSearchCriteria} />
          {isNative ? (
            <NativeFilterChips
              sort={search.sort}
              onSortChange={(s) => updateSearch({ sort: s })}
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
              location={location}
              onLocationChange={handleLocationChange}
              resultCount={totalCount ?? cards.length}
              onOpenAdvanced={() => setAdvancedOverlayOpen(true)}
              advancedFilterCount={
                (search.extraGroups?.length ?? 0) + (search.qMode === "any" ? 1 : 0)
              }
            />
          ) : (
            <DesktopFilterChips
              sort={search.sort}
              onSortChange={(s) => updateSearch({ sort: s })}
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
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              extraGroups={search.extraGroups ?? []}
              onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
            />
          )}

          {/* Category-dependent filter row: the selected category's primary
            fields stay visible, the rest sit behind "Se flere filter". */}
          <AttributeFilterChips
            filters={attrFilters}
            values={attrValues}
            onChange={handleAttrValueChange}
            isNative={isNative}
            resultCount={totalCount ?? cards.length}
          />

          {/* Rendered inside the same space-y-2 group as the search bar and
              filter chips above, rather than as a separately-spaced sibling,
              so the active-criteria row reads as part of one continuous
              search-and-filter unit instead of a visually detached block. */}
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
            onRemoveAttr={(key, value) => {
              const current = attrValues[key];
              if (value !== undefined && current?.kind === "multiselect") {
                const next = current.values.filter((v) => v !== value);
                handleAttrValueChange(
                  key,
                  next.length > 0 ? { kind: "multiselect", values: next } : undefined,
                );
                return;
              }
              handleAttrValueChange(key, undefined);
            }}
          />
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
            onRemoveAttr={(key) => handleAttrValueChange(key, undefined)}
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
            toolbarExtra={
              user ? (
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

        {/* Native full-screen search overlay */}
        {isNative && (
          <NativeSearchOverlay
            open={searchOverlayOpen}
            onClose={() => setSearchOverlayOpen(false)}
            initialQ={qDraft}
            categories={categories ?? []}
          />
        )}

        {/* Native full-screen advanced search */}
        {isNative && (
          <NativeAdvancedSearch
            open={advancedOverlayOpen}
            onClose={() => setAdvancedOverlayOpen(false)}
            initial={advancedInitial}
            categories={categories ?? []}
            onApply={handleApply}
          />
        )}
      </div>
    </div>
  );
}
