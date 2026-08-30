import {
  ArrowUpDown,
  Expand,
  LayoutList,
  LayoutGrid,
  Rows3,
  Image,
  Map as MapIcon,
  SearchX,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { ListingCardExpanded } from "@/components/listing-card-expanded";
import { ListingCardImages } from "@/components/listing-card-images";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSheet } from "@/components/ui/native-sheet";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import type { MapListing } from "@/components/listings-map";
import { FeaturedListingsSection } from "@/components/featured-listings-section";
import { reverseGeocode } from "@/lib/geocode";
import { hapticImpact } from "@/lib/haptics";
import { useFormFactor } from "@/hooks/use-form-factor";
import { getSortChipState } from "@/lib/filter-chip-labels";
import { SORT_OPTIONS, type SortValue } from "@/lib/categories";
import type { ZeroResultExpansion } from "@/features/listing-search/zero-result-expansion";
import { useListingCardImages } from "@/hooks/use-listing-card-images";
import { useListingFavorites } from "@/hooks/use-listing-favorites";
import { trackProductEvent } from "@/lib/product-analytics";

const ListingsMap = lazy(() =>
  import("@/components/listings-map").then((m) => ({ default: m.ListingsMap })),
);

type Props = {
  isNative: boolean;
  isDesktop: boolean;
  q: string;
  effectiveCategories: string[];
  cards: ListingCardData[];
  totalCount: number | null;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  resetFilters: () => void;
  zeroResultExpansion?: ZeroResultExpansion;
  zeroResultExpansions?: ZeroResultExpansion[];
  zeroResultExpansionPending?: boolean;
  onApplyZeroResultExpansion?: (expansion: ZeroResultExpansion) => void;
  hasActiveCriteria?: boolean;
  onBrowseCategories?: () => void;
  mapListings: MapListing[];
  mapCenter: { lat: number; lng: number } | null;
  radiusKm: number;
  onMapCenterChange: (c: { lat: number; lng: number }, label: string | null) => void;
  onMapRadiusChange?: (km: number) => void;
  onMapClearLocation?: () => void;
  onMapApplyViewport?: (
    c: { lat: number; lng: number },
    radiusKm: number,
    label: string | null,
  ) => void;
  /** Sorting is a view setting, not a search criterion, so it lives here next
   * to "Skjul kart"/"Lagre søk" instead of in the filter-chip row. */
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
  /** Extra toolbar actions (e.g. "Lagre søk") — annonser-specific, so left to the caller. */
  toolbarExtra?: ReactNode;
};

/**
 * Shared results view (toolbar, card grid/list, map) used by both /annonser
 * and category pages, so every entry point into a result set renders the
 * exact same layout regardless of how the user got there.
 */
export function ResultList({
  isNative,
  isDesktop,
  q,
  effectiveCategories,
  cards,
  totalCount,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  resetFilters,
  zeroResultExpansion,
  zeroResultExpansions = [],
  zeroResultExpansionPending = false,
  onApplyZeroResultExpansion,
  hasActiveCriteria,
  onBrowseCategories,
  mapListings,
  mapCenter,
  onMapApplyViewport,
  radiusKm,
  onMapCenterChange,
  onMapRadiusChange,
  onMapClearLocation,
  sort,
  onSortChange,
  toolbarExtra,
}: Props) {
  const formFactor = useFormFactor();
  const nativePhone = isNative && formFactor === "phone";
  const nativeTablet = isNative && formFactor === "tablet";
  const [sortOpen, setSortOpen] = useState(false);
  const { label: sortLabel } = getSortChipState(sort);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [bigMapOpen, setBigMapOpen] = useState(false);
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "card" | "images">(() => {
    try {
      return (
        (localStorage.getItem("kaupet_view_mode") as "grid" | "list" | "card" | "images") ?? "grid"
      );
    } catch {
      return "grid";
    }
  });
  const changeViewMode = (next: "grid" | "list" | "card" | "images") => {
    void hapticImpact("light");
    setViewMode(next);
    try {
      localStorage.setItem("kaupet_view_mode", next);
    } catch {
      /* ignore */
    }
  };
  const [viewModeOpen, setViewModeOpen] = useState(false);
  const VIEW_MODE_META = {
    grid: { icon: LayoutGrid, label: "Fliser" },
    list: { icon: LayoutList, label: "Liste" },
    card: { icon: Rows3, label: "Kort" },
    images: { icon: Image, label: "Bilder" },
  } as const;
  const { icon: ViewModeIcon, label: viewModeLabel } = VIEW_MODE_META[viewMode];
  const signedImageUrls = useListingCardImages(cards);
  const { favoriteIds, isReady: favoriteStateReady } = useListingFavorites(
    cards.map((card) => card.id),
  );
  const zeroResultKey = `${q}|${effectiveCategories.join(",")}`;

  useEffect(() => {
    if (isLoading || cards.length > 0) return;
    trackProductEvent("search_zero_results", {
      hasQuery: q.trim().length > 0,
      hasCategory: effectiveCategories.length > 0,
    });
  }, [cards.length, effectiveCategories.length, isLoading, q, zeroResultKey]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderMap = () => (
    <ClientOnly fallback={<Skeleton className="h-full w-full rounded-2xl" />}>
      <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" />}>
        <ListingsMap
          center={mapCenter}
          radiusKm={radiusKm}
          listings={mapListings}
          hoveredId={hoveredId}
          activeId={activeId}
          onMarkerHover={setHoveredId}
          onMarkerSelect={setActiveId}
          onCenterChange={(c) => {
            if (isNative) return;
            onMapCenterChange(c, "Henter sted…");
            void reverseGeocode(c).then((name) => onMapCenterChange(c, name ?? "Valgt punkt"));
          }}
          onApplyViewport={(c, radius) => {
            if (!onMapApplyViewport) return;
            void reverseGeocode(c).then((name) =>
              onMapApplyViewport(c, radius, name ?? "Valgt punkt"),
            );
          }}
          onRadiusChange={onMapRadiusChange}
          onClearLocation={onMapClearLocation}
          deferViewport={isNative}
          edgeToEdge={nativePhone}
          compactTouchControls={nativePhone}
          className="h-full w-full"
        />
      </Suspense>
    </ClientOnly>
  );
  const expansionOptions =
    zeroResultExpansions.length > 0
      ? zeroResultExpansions
      : zeroResultExpansion
        ? [zeroResultExpansion]
        : [];
  const criteriaActive =
    hasActiveCriteria ?? (q.trim().length > 0 || effectiveCategories.length > 0);

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span role="status" aria-live="polite" aria-atomic="true">
            {isLoading
              ? "Søker…"
              : `${(totalCount ?? cards.length).toLocaleString("nb-NO")} annonse${(totalCount ?? cards.length) === 1 ? "" : "r"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isNative ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shadow-none"
                aria-expanded={viewModeOpen}
                onClick={() => setViewModeOpen(true)}
              >
                <ViewModeIcon className="size-4" /> {viewModeLabel}
              </Button>
              <NativeChoiceSheet
                open={viewModeOpen}
                onOpenChange={setViewModeOpen}
                title="Visning"
                options={[
                  { value: "grid", label: "Fliser" },
                  { value: "list", label: "Liste" },
                ]}
                value={[viewMode === "grid" || viewMode === "list" ? viewMode : "grid"]}
                onChange={(next) => {
                  const mode = next[0];
                  if (mode === "grid" || mode === "list") changeViewMode(mode);
                  setViewModeOpen(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shadow-none"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen(true)}
              >
                <ArrowUpDown className="size-4" /> {sortLabel}
              </Button>
              <NativeChoiceSheet
                open={sortOpen}
                onOpenChange={setSortOpen}
                title="Sorter annonser"
                options={SORT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={[sort]}
                onChange={(next) => {
                  const value = next[0];
                  if (value) onSortChange(value as SortValue);
                  setSortOpen(false);
                }}
              />
            </>
          ) : (
            <>
              <Popover open={viewModeOpen} onOpenChange={setViewModeOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <ViewModeIcon className="size-4" /> {viewModeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 p-1">
                  {(Object.keys(VIEW_MODE_META) as Array<keyof typeof VIEW_MODE_META>).map(
                    (mode) => {
                      const { icon: Icon, label } = VIEW_MODE_META[mode];
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            changeViewMode(mode);
                            setViewModeOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted ${
                            viewMode === mode ? "bg-muted font-medium" : ""
                          }`}
                        >
                          <Icon className="size-4" /> {label}
                        </button>
                      );
                    },
                  )}
                </PopoverContent>
              </Popover>
              <Popover open={sortOpen} onOpenChange={setSortOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <ArrowUpDown className="size-4" /> {sortLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1">
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        onSortChange(s.value);
                        setSortOpen(false);
                      }}
                      className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${
                        sort === s.value ? "bg-muted font-medium" : ""
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </>
          )}
          {!isDesktop && !isNative && (
            <NativeSheet
              open={mobileMapOpen}
              onOpenChange={setMobileMapOpen}
              title="Kart"
              titleVisible
              className="h-[88vh] p-4"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => trackProductEvent("search_map_opened", { source: "map_button" })}
                >
                  <MapIcon className="size-4" /> Kart
                </Button>
              }
            >
              <div className="mt-3 h-[calc(100%-3rem)]">{mobileMapOpen ? renderMap() : null}</div>
            </NativeSheet>
          )}
          {(isDesktop || nativeTablet) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                trackProductEvent("search_map_opened", { source: "map_button" });
                setDesktopMapVisible((v) => !v);
              }}
              aria-pressed={desktopMapVisible}
            >
              <MapIcon className="size-4" /> {desktopMapVisible ? "Skjul kart" : "Vis kart"}
            </Button>
          )}
          {toolbarExtra}
        </div>
      </div>

      <div
        className={`mt-4 grid gap-6 ${
          isDesktop && desktopMapVisible && cards.length > 0
            ? "lg:grid-cols-[1fr_420px]"
            : nativeTablet && desktopMapVisible && cards.length > 0
              ? "grid-cols-[minmax(320px,1fr)_minmax(320px,0.8fr)]"
              : ""
        }`}
      >
        <div>
          {!isLoading && (
            <FeaturedListingsSection
              categorySlug={effectiveCategories.length === 1 ? effectiveCategories[0] : undefined}
              allowedIds={new Set(cards.map((l) => l.id))}
              limit={3}
            />
          )}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                  <Skeleton className="aspect-[4/3] rounded-none" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Ingen annonser funnet"
              description={
                q && effectiveCategories.length > 0
                  ? `Ingen treff for «${q}» i valgt kategori. Prøv å søke i alle kategorier eller bruk andre søkeord.`
                  : q
                    ? `Ingen treff for «${q}». Prøv andre søkeord eller fjern filtre.`
                    : effectiveCategories.length > 0
                      ? "Ingen annonser i valgt kategori. Prøv å velge en bredere kategori."
                      : "Prøv et bredere søk eller øk radiusen."
              }
              action={
                <>
                  {expansionOptions.length > 0 && onApplyZeroResultExpansion ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      {expansionOptions.map((option) => (
                        <Button
                          key={option.key}
                          variant="outline"
                          onClick={() => onApplyZeroResultExpansion(option)}
                        >
                          Vis {option.count.toLocaleString("nb-NO")} treff uten «{option.label}»
                        </Button>
                      ))}
                    </div>
                  ) : zeroResultExpansionPending ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="text-sm text-muted-foreground"
                    >
                      Ser etter en bredere variant …
                    </span>
                  ) : criteriaActive ? (
                    <Button variant="outline" onClick={resetFilters}>
                      Nullstill alle filtre
                    </Button>
                  ) : onBrowseCategories ? (
                    <Button variant="outline" onClick={onBrowseCategories}>
                      Utforsk kategorier
                    </Button>
                  ) : null}
                </>
              }
            />
          ) : (
            <div
              className={
                viewMode === "list" || viewMode === "card" || viewMode === "images"
                  ? "flex flex-col gap-3"
                  : `grid grid-cols-2 gap-4 sm:grid-cols-3 ${
                      (isDesktop || nativeTablet) && !desktopMapVisible
                        ? "lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                        : ""
                    }`
              }
            >
              {cards.map((l, index) =>
                viewMode === "card" ? (
                  <ListingCardExpanded
                    key={l.id}
                    listing={l}
                    linkState={{ fromSearch: true }}
                    onOpen={() =>
                      trackProductEvent("search_result_opened", {
                        position: index + 1,
                        resultCount: totalCount ?? cards.length,
                      })
                    }
                    coverImageUrl={signedImageUrls[l.id] ?? null}
                    knownFavorite={favoriteIds.has(l.id)}
                    favoriteStateReady={favoriteStateReady}
                  />
                ) : viewMode === "images" ? (
                  <ListingCardImages
                    key={l.id}
                    listing={l}
                    linkState={{ fromSearch: true }}
                    onOpen={() =>
                      trackProductEvent("search_result_opened", {
                        position: index + 1,
                        resultCount: totalCount ?? cards.length,
                      })
                    }
                    coverImageUrl={signedImageUrls[l.id] ?? null}
                    knownFavorite={favoriteIds.has(l.id)}
                    favoriteStateReady={favoriteStateReady}
                  />
                ) : (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    highlighted={hoveredId === l.id || activeId === l.id}
                    onHoverChange={setHoveredId}
                    compact={viewMode === "list"}
                    linkState={{ fromSearch: true }}
                    onOpen={() =>
                      trackProductEvent("search_result_opened", {
                        position: index + 1,
                        resultCount: totalCount ?? cards.length,
                      })
                    }
                    signedImageUrl={signedImageUrls[l.id] ?? null}
                    knownFavorite={favoriteIds.has(l.id)}
                    favoriteStateReady={favoriteStateReady}
                  />
                ),
              )}
            </div>
          )}
          {/* Infinite scroll sentinel — same pattern on web and native. */}
          {!isLoading && hasNextPage && <div ref={sentinelRef} className="h-4" />}
          {isFetchingNextPage && (
            <div className="mt-6 flex justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>

        {(isDesktop || nativeTablet) && desktopMapVisible && cards.length > 0 && (
          <aside>
            <div className="sticky top-20 h-[calc(100vh-6rem)]">
              <div className="relative h-full overflow-hidden rounded-2xl border border-border shadow-sm">
                {renderMap()}
                <FullscreenOverlay open={bigMapOpen} onOpenChange={setBigMapOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute right-3 top-3 z-[450] rounded-full shadow-md"
                    >
                      <Expand className="size-4" /> Utvid
                    </Button>
                  </DialogTrigger>
                  <FullscreenOverlayContent title="Kart" edgeToEdge>
                    <div className="flex h-full flex-col bg-background">
                      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                        <h2 className="text-base font-semibold">Kart</h2>
                        <DialogClose asChild>
                          <Button type="button" variant="ghost" size="sm">
                            <X className="size-4" /> Lukk
                          </Button>
                        </DialogClose>
                      </div>
                      <div className="min-h-0 flex-1 p-4 pt-2">
                        {bigMapOpen ? renderMap() : null}
                      </div>
                    </div>
                  </FullscreenOverlayContent>
                </FullscreenOverlay>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Native kart åpnes som en fullskjerm takeover, slik at kartet får
          samme edge-to-edge-opplevelse som andre native medieflater. */}
      {isNative && (
        <>
          <FullscreenOverlay open={mobileMapOpen} onOpenChange={setMobileMapOpen}>
            <FullscreenOverlayContent title="Kart over søkeresultater" edgeToEdge>
              <div className="flex h-full flex-col bg-background">
                <div className="pt-safe flex shrink-0 items-center justify-between border-b border-border px-4 pb-3">
                  <div>
                    <h2 className="text-base font-semibold">Kart</h2>
                    <p className="text-xs text-muted-foreground">
                      {mapListings.length} mulige treff
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="native-touch-target"
                    onClick={() => setMobileMapOpen(false)}
                    aria-label="Lukk kart"
                  >
                    <X className="size-5" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1">{mobileMapOpen ? renderMap() : null}</div>
              </div>
            </FullscreenOverlayContent>
          </FullscreenOverlay>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("medium");
              trackProductEvent("search_map_opened", { source: "map_button" });
              setMobileMapOpen(true);
            }}
            className="fixed bottom-[calc(var(--app-bottom-nav-h)+1rem)] right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95"
            aria-label="Vis kart"
          >
            <MapIcon className="size-6" />
            {mapListings.length > 0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {mapListings.length > 99 ? "99+" : mapListings.length}
              </span>
            )}
          </button>
        </>
      )}
    </>
  );
}
