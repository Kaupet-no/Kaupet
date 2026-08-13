import { ArrowUpDown, Expand, LayoutList, LayoutGrid, Map as MapIcon, SearchX } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSheet } from "@/components/ui/native-sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MapListing } from "@/components/listings-map";
import { FeaturedListingsSection } from "@/components/featured-listings-section";
import { reverseGeocode } from "@/lib/geocode";
import { hapticImpact } from "@/lib/haptics";
import { getAttributeChipState, getSortChipState } from "@/lib/filter-chip-labels";
import { SORT_OPTIONS, type SortValue } from "@/lib/categories";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
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
  onClearCategoryFilter?: () => void;
  /** Re-search with the last word of `q` dropped — offered on zero results
   * for a multi-word query, since the last word is often the culprit. */
  onDropLastWord?: (nextQ: string) => void;
  /** Active category-attribute filters — used on zero results to suggest
   * dropping the most restrictive one first (attribute/location filters are
   * a more likely culprit than free-text terms, which already fall back to
   * trigram matching). */
  attrFilters?: CategoryFilter[];
  attrValues?: Record<string, AttributeFilterValue>;
  onRemoveAttr?: (key: string) => void;
  mapListings: MapListing[];
  mapCenter: { lat: number; lng: number } | null;
  radiusKm: number;
  onMapCenterChange: (c: { lat: number; lng: number }, label: string | null) => void;
  onMapRadiusChange?: (km: number) => void;
  onMapClearLocation?: () => void;
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
  onClearCategoryFilter,
  onDropLastWord,
  attrFilters = [],
  attrValues = {},
  onRemoveAttr,
  mapListings,
  mapCenter,
  radiusKm,
  onMapCenterChange,
  onMapRadiusChange,
  onMapClearLocation,
  sort,
  onSortChange,
  toolbarExtra,
}: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const { label: sortLabel } = getSortChipState(sort);
  const qWords = q.trim().split(/\s+/).filter(Boolean);
  const lastWord = qWords.length > 1 ? qWords[qWords.length - 1] : null;
  // Most restrictive active attribute filter, offered as the first recovery
  // action on zero results — structured filters narrow the result set harder
  // than a free-text term, which already tolerates typos via trigram fallback.
  const [mostRestrictiveAttrKey] = Object.keys(attrValues);
  const mostRestrictiveAttrFilter = attrFilters.find((f) => f.key === mostRestrictiveAttrKey);
  const mostRestrictiveAttrLabel = mostRestrictiveAttrFilter
    ? getAttributeChipState(mostRestrictiveAttrFilter, attrValues[mostRestrictiveAttrKey]).label
    : null;
  const [mounted, setMounted] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [bigMapOpen, setBigMapOpen] = useState(false);
  const [desktopMapVisible, setDesktopMapVisible] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("kaupet_view_mode") as "grid" | "list") ?? "grid";
    } catch {
      return "grid";
    }
  });
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

  useEffect(() => setMounted(true), []);

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

  const renderMap = () =>
    mounted ? (
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
            onMapCenterChange(c, "Henter sted…");
            void reverseGeocode(c).then((name) => onMapCenterChange(c, name ?? "Valgt punkt"));
          }}
          onRadiusChange={onMapRadiusChange}
          onClearLocation={onMapClearLocation}
          className="h-full w-full"
        />
      </Suspense>
    ) : (
      <Skeleton className="h-full w-full rounded-2xl" />
    );

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {isLoading
              ? "Søker…"
              : `${(totalCount ?? cards.length).toLocaleString("nb-NO")} annonse${(totalCount ?? cards.length) === 1 ? "" : "r"}`}
          </span>
          {isNative && (
            <button
              type="button"
              onClick={() => {
                void hapticImpact("light");
                const next = viewMode === "grid" ? "list" : "grid";
                setViewMode(next);
                try {
                  localStorage.setItem("kaupet_view_mode", next);
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={
                viewMode === "grid" ? "Bytt til listevisning" : "Bytt til rutenettvisning"
              }
            >
              {viewMode === "grid" ? (
                <LayoutList className="size-4" />
              ) : (
                <LayoutGrid className="size-4" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          {!isDesktop && !isNative && (
            <NativeSheet
              open={mobileMapOpen}
              onOpenChange={setMobileMapOpen}
              title="Kart"
              titleVisible
              className="h-[88vh] p-4"
              trigger={
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <MapIcon className="size-4" /> Kart
                </Button>
              }
            >
              <div className="mt-3 h-[calc(100%-3rem)]">{mobileMapOpen ? renderMap() : null}</div>
            </NativeSheet>
          )}
          {isDesktop && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDesktopMapVisible((v) => !v)}
              aria-pressed={desktopMapVisible}
            >
              <MapIcon className="size-4" /> {desktopMapVisible ? "Skjul kart" : "Vis kart"}
            </Button>
          )}
          {toolbarExtra}
        </div>
      </div>

      <div
        className={`mt-4 grid gap-6 ${isDesktop && desktopMapVisible ? "lg:grid-cols-[1fr_420px]" : ""}`}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                  {mostRestrictiveAttrFilter && mostRestrictiveAttrLabel && onRemoveAttr && (
                    <Button variant="outline" onClick={() => onRemoveAttr(mostRestrictiveAttrKey)}>
                      Fjern «{mostRestrictiveAttrLabel}»
                    </Button>
                  )}
                  {effectiveCategories.length > 0 && onClearCategoryFilter && (
                    <Button variant="outline" onClick={onClearCategoryFilter}>
                      Fjern kategorifilter
                    </Button>
                  )}
                  {lastWord && onDropLastWord && (
                    <Button
                      variant="outline"
                      onClick={() => onDropLastWord(qWords.slice(0, -1).join(" "))}
                    >
                      Prøv uten «{lastWord}»
                    </Button>
                  )}
                  {mapCenter && onMapClearLocation && (
                    <Button variant="outline" onClick={onMapClearLocation}>
                      Vis resultater i hele Norge
                    </Button>
                  )}
                  <Button variant="outline" onClick={resetFilters}>
                    Nullstill alle filtre
                  </Button>
                </>
              }
            />
          ) : (
            <div
              className={
                isNative && viewMode === "list"
                  ? "flex flex-col gap-3"
                  : `grid grid-cols-2 gap-4 sm:grid-cols-3 ${isDesktop && !desktopMapVisible ? "lg:grid-cols-4" : ""}`
              }
            >
              {cards.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  highlighted={hoveredId === l.id || activeId === l.id}
                  onHoverChange={setHoveredId}
                  compact={isNative && viewMode === "list"}
                  linkState={{ fromSearch: true }}
                  signedImageUrl={signedImageUrls[l.id] ?? null}
                  knownFavorite={favoriteIds.has(l.id)}
                  favoriteStateReady={favoriteStateReady}
                />
              ))}
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

        {isDesktop && desktopMapVisible && (
          <aside>
            <div className="sticky top-20 h-[calc(100vh-6rem)]">
              <div className="relative h-full overflow-hidden rounded-2xl border border-border shadow-sm">
                {renderMap()}
                <Dialog open={bigMapOpen} onOpenChange={setBigMapOpen}>
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
                  <DialogContent className="max-w-[95vw] p-0 sm:max-w-[95vw]">
                    <DialogHeader className="px-4 pt-4">
                      <DialogTitle>Kart</DialogTitle>
                    </DialogHeader>
                    <div className="h-[85vh] w-full p-4 pt-2">
                      {bigMapOpen ? renderMap() : null}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Native kart-FAB + Sheet */}
      {isNative && (
        <>
          <NativeSheet
            open={mobileMapOpen}
            onOpenChange={setMobileMapOpen}
            title="Kart"
            titleVisible
            expandable
            initialSnapPoint={1}
            className="h-full p-4"
          >
            <div className="mt-3 h-[calc(100%-3rem)]">{mobileMapOpen ? renderMap() : null}</div>
          </NativeSheet>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("medium");
              setMobileMapOpen(true);
            }}
            className="fixed bottom-[calc(var(--app-bottom-nav-h)+1rem)] right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition"
            aria-label="Vis kart"
          >
            <MapIcon className="size-6" />
            {mapListings.length > 0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {mapListings.length > 99 ? "99+" : mapListings.length}
              </span>
            )}
          </button>
        </>
      )}
    </>
  );
}
