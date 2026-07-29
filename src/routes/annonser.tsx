import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { NativeSearchOverlay } from "@/components/native-search-overlay";
import { NativeAdvancedSearch } from "@/components/native-advanced-search";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { WtbListingCard } from "@/components/wtb-listing-card";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import { normalizeFilter } from "@/lib/category-filters";
import { useWtbListings } from "@/features/listing-search/use-wtb-listings";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { hapticImpact } from "@/lib/haptics";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";

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

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data;
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
    <div className={`mx-auto max-w-7xl px-4 ${isNative ? "pt-2 pb-8" : "py-8 md:py-10"}`}>
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
      {!isNative && <h1 className="font-display text-3xl tracking-tight">Annonser</h1>}

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
              location={location}
              onLocationChange={handleLocationChange}
              selectedSlugs={[]}
              onSelectedChange={() => {}}
              categories={categories ?? []}
              hideCategory
              hideLocation
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
            location={location}
            onLocationChange={handleLocationChange}
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
            hideCategory
            qMode={search.qMode}
            onQModeChange={(m) => updateSearch({ qMode: m })}
            showQMode={false}
          />
        )}
        {isNative ? (
          <NativeFilterChips
            sort={search.sort}
            onSortChange={(s) => updateSearch({ sort: s })}
            categories={categories ?? []}
            selectedCategories={effectiveCategories}
            onCategoriesChange={(slugs) =>
              updateSearch({ category: "", categories: slugs, catMode: "any" })
            }
            min={search.min}
            max={search.max}
            includeFree={search.includeFree ?? true}
            onPriceChange={(mn, mx, free) => updateSearch({ min: mn, max: mx, includeFree: free })}
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
            attrFilters={attrFilters}
            attrValues={attrValues}
            onAttrValuesChange={handleAttrValueChange}
          />
        ) : (
          <DesktopFilterChips
            sort={search.sort}
            onSortChange={(s) => updateSearch({ sort: s })}
            categories={categories ?? []}
            selectedCategories={effectiveCategories}
            onCategoriesChange={(slugs) =>
              updateSearch({ category: "", categories: slugs, catMode: "any" })
            }
            min={search.min}
            max={search.max}
            includeFree={search.includeFree ?? true}
            onPriceChange={(mn, mx, free) => updateSearch({ min: mn, max: mx, includeFree: free })}
            conditions={search.conditions ?? []}
            onConditionsChange={(c) =>
              updateSearch({ conditions: c as z.infer<typeof conditionEnum>[] })
            }
            qMode={search.qMode}
            onQModeChange={(m) => updateSearch({ qMode: m })}
            extraGroups={search.extraGroups ?? []}
            onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
            attrFilters={attrFilters}
            attrValues={attrValues}
            onAttrValuesChange={handleAttrValueChange}
          />
        )}
      </div>

      <ActiveFilters
        search={search}
        terms={terms}
        onUpdate={(patch) => updateSearch(patch)}
        attrFilters={attrFilters}
        attrValues={attrValues}
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
          mapListings={mapListings}
          mapCenter={mapCenter}
          radiusKm={search.radius ?? 10}
          onMapCenterChange={(c, label) =>
            updateSearch({ lat: c.lat, lng: c.lng, radius: search.radius ?? 10, loc: label ?? "" })
          }
          onMapAreaSearch={(c, label) =>
            updateSearch({ lat: c.lat, lng: c.lng, radius: search.radius ?? 10, loc: label ?? "" })
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
  );
}
