import { formatNokNumber } from "@/lib/format";
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
  List,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CatchBoundary, ClientOnly, type ErrorComponentProps } from "@tanstack/react-router";

import { ListingCard } from "@/components/listing-card";
import type { ListingCardData } from "@/lib/listing-card-data";
import { ListingCardExpanded } from "@/components/listing-card-expanded";
import { ListingCardImages } from "@/components/listing-card-images";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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

const ListingsMap = lazy(() =>
  import("@/components/listings-map").then((m) => ({ default: m.ListingsMap })),
);

// Etter en deploy finnes ikke lenger kartchunken fra forrige bygg, så bare en
// sidelasting hjelper. Chrome/Firefox: «Failed to fetch dynamically imported
// module», Safari: «Importing a module script failed».
const isChunkLoadError = (error: unknown) =>
  error instanceof Error &&
  /dynamically imported module|Importing a module script failed/i.test(error.message);

function MapErrorFallback({ error, reset }: ErrorComponentProps) {
  const reload = isChunkLoadError(error);
  return (
    <div
      role="alert"
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center"
    >
      <MapIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">Kunne ikke laste kartet</p>
      <p className="text-xs text-muted-foreground">Resten av søket fungerer som vanlig.</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={reload ? () => window.location.reload() : reset}
      >
        {reload ? "Last inn siden på nytt" : "Prøv på nytt"}
      </Button>
    </div>
  );
}

// Konstant referanse — unngår at kortene under (memoiserte) får et nytt
// linkState-objekt hver rendring, som ville nullstilt memoiseringen.
const SEARCH_LINK_STATE = { fromSearch: true };

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
  /** Set when the search text matches an existing category name (F8) — offered
   * as a "Gå til <kategori>" suggestion on zero results, since a plain-text
   * query that happens to be a category name usually means the user wants
   * that category. See matchCategoryPhrase in search-category-match.ts. */
  categorySuggestion?: { categoryName: string; onApply: () => void };
  mapListings: MapListing[];
  mapCenter: { lat: number; lng: number } | null;
  radiusKm: number;
  onMapApplyViewport: (
    c: { lat: number; lng: number },
    radiusKm: number,
    label: string | null,
  ) => void | Promise<void>;
  onMapClearLocation?: () => void;
  /** Sorting is a view setting, not a search criterion, so it lives here next
   * to "Skjul kart"/"Lagre søk" instead of in the filter-chip row. */
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
  /** Extra toolbar actions (e.g. "Lagre søk") — annonser-specific, so left to the caller. */
  toolbarExtra?: ReactNode;
  /** Innhold helt først i verktøylinja, ved siden av treffantallet. Filtrering
   * er den viktigste kontrollen på en smal skjerm og skal ikke kunne skyves
   * utenfor kanten av visningsvalg/sortering/kart, som `toolbarExtra` gjør. */
  toolbarLead?: ReactNode;
  /** Native resultatflater med brikkerad har sorteringen der i stedet. */
  hideSort?: boolean;
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
  categorySuggestion,
  mapListings,
  mapCenter,
  onMapApplyViewport,
  radiusKm,
  onMapClearLocation,
  sort,
  onSortChange,
  toolbarExtra,
  toolbarLead,
  hideSort = false,
}: Props) {
  const formFactor = useFormFactor();
  const nativePhone = isNative && formFactor === "phone";
  const nativeTablet = isNative && formFactor === "tablet";
  const [sortOpen, setSortOpen] = useState(false);
  const { label: sortLabel } = getSortChipState(sort);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [bigMapOpen, setBigMapOpen] = useState(false);
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const [viewportApplying, setViewportApplying] = useState(false);
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
  // new Set(...) hver rendring ville brutt memoisering av det som leser den.
  const allowedIds = useMemo(() => new Set(cards.map((l) => l.id)), [cards]);

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

  const applyMapViewport = async (center: { lat: number; lng: number }, radius: number) => {
    if (viewportApplying) return;
    setViewportApplying(true);
    try {
      const label = await reverseGeocode(center);
      await onMapApplyViewport(center, radius, label ?? "Valgt punkt");
    } finally {
      setViewportApplying(false);
    }
  };

  const mapResetKey = `${mapCenter?.lat ?? ""},${mapCenter?.lng ?? ""},${radiusKm},${mapListings.length}`;

  const renderMap = () => (
    <CatchBoundary getResetKey={() => mapResetKey} errorComponent={MapErrorFallback}>
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
            onApplyViewport={applyMapViewport}
            onClearLocation={onMapClearLocation}
            viewportApplying={viewportApplying}
            deferViewport={isNative}
            edgeToEdge={nativePhone}
            compactTouchControls={nativePhone}
            className="h-full w-full"
          />
        </Suspense>
      </ClientOnly>
    </CatchBoundary>
  );
  const expansionOptions =
    zeroResultExpansions.length > 0
      ? zeroResultExpansions
      : zeroResultExpansion
        ? [zeroResultExpansion]
        : [];
  // Free-text alone isn't a "filter" that Nullstill alle filtre can undo —
  // only an actual category/attribute/price/etc. selection is (F8).
  const criteriaActive = hasActiveCriteria ?? effectiveCategories.length > 0;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span role="status" aria-live="polite" aria-atomic="true">
            {isLoading
              ? "Søker…"
              : `${formatNokNumber(totalCount ?? cards.length)} annonse${(totalCount ?? cards.length) === 1 ? "" : "r"}`}
          </span>
          {toolbarLead}
        </div>
        <div className="flex items-center gap-2">
          {isNative ? (
            <>
              {toolbarExtra}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="native-touch-target size-9 shadow-none"
                aria-expanded={viewModeOpen}
                aria-label={`Visning: ${viewModeLabel}`}
                onClick={() => setViewModeOpen(true)}
              >
                <ViewModeIcon className="size-5" />
              </Button>
              <NativeChoiceSheet
                open={viewModeOpen}
                onOpenChange={setViewModeOpen}
                title="Visning"
                options={(Object.keys(VIEW_MODE_META) as Array<keyof typeof VIEW_MODE_META>).map(
                  (mode) => ({ value: mode, label: VIEW_MODE_META[mode].label }),
                )}
                value={[viewMode]}
                onChange={(next) => {
                  const mode = next[0];
                  if (mode && mode in VIEW_MODE_META) {
                    changeViewMode(mode as keyof typeof VIEW_MODE_META);
                  }
                  setViewModeOpen(false);
                }}
              />
              {!hideSort && (
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
              )}
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
            <FullscreenOverlay open={mobileMapOpen} onOpenChange={setMobileMapOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <MapIcon className="size-4" /> Kart
                </Button>
              </DialogTrigger>
              <FullscreenOverlayContent title="Kart over søkeresultater" edgeToEdge>
                <div className="flex h-full flex-col bg-background">
                  <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 pt-safe">
                    <h2 className="font-semibold">Kart</h2>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost" className="min-h-12">
                        Lukk kart
                      </Button>
                    </DialogClose>
                  </div>
                  <div className="min-h-0 flex-1">{mobileMapOpen ? renderMap() : null}</div>
                </div>
              </FullscreenOverlayContent>
            </FullscreenOverlay>
          )}
          {(isDesktop || nativeTablet) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setDesktopMapVisible((v) => !v);
              }}
              aria-pressed={desktopMapVisible}
            >
              <MapIcon className="size-4" /> {desktopMapVisible ? "Skjul kart" : "Vis kart"}
            </Button>
          )}
          {!isNative && toolbarExtra}
        </div>
      </div>

      <div
        // Signal til SearchResultsBody (:has) om at kartet tar plass, slik at
        // filterkolonnen vikes unna på skjermer under 2xl.
        data-map-visible={isDesktop && desktopMapVisible ? "" : undefined}
        className={`mt-4 grid gap-6 ${
          isDesktop && desktopMapVisible
            ? "lg:grid-cols-[1fr_420px]"
            : nativeTablet && desktopMapVisible
              ? "grid-cols-[minmax(320px,1fr)_minmax(320px,0.8fr)]"
              : ""
        }`}
      >
        <div>
          {!isLoading && (
            <FeaturedListingsSection
              categorySlug={effectiveCategories.length === 1 ? effectiveCategories[0] : undefined}
              allowedIds={allowedIds}
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
                    ? criteriaActive
                      ? `Ingen treff for «${q}». Prøv andre søkeord eller fjern filtre.`
                      : `Ingen treff for «${q}». Prøv andre søkeord.`
                    : effectiveCategories.length > 0
                      ? "Ingen annonser i valgt kategori. Prøv å velge en bredere kategori."
                      : "Prøv et bredere søk eller øk radiusen."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {categorySuggestion && (
                    <Button variant="outline" onClick={categorySuggestion.onApply}>
                      Gå til {categorySuggestion.categoryName}
                    </Button>
                  )}
                  {expansionOptions.length > 0 && onApplyZeroResultExpansion ? (
                    expansionOptions.map((option) => (
                      <Button
                        key={option.key}
                        variant="outline"
                        onClick={() => onApplyZeroResultExpansion(option)}
                      >
                        Vis {formatNokNumber(option.count)} treff uten «{option.label}»
                      </Button>
                    ))
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
                </div>
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
              {cards.map((l) =>
                viewMode === "card" ? (
                  <ListingCardExpanded
                    key={l.id}
                    listing={l}
                    linkState={SEARCH_LINK_STATE}
                    coverImageUrl={signedImageUrls[l.id] ?? null}
                    knownFavorite={favoriteIds.has(l.id)}
                    favoriteStateReady={favoriteStateReady}
                  />
                ) : viewMode === "images" ? (
                  <ListingCardImages
                    key={l.id}
                    listing={l}
                    linkState={SEARCH_LINK_STATE}
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
                    linkState={SEARCH_LINK_STATE}
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

        {(isDesktop || nativeTablet) && desktopMapVisible && (
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
              {/* Kartet går kant til kant; samme søk som listen, bare en
                  annen visning. «Liste»-pillen står der «Kart»-pillen stod. */}
              <div className="relative h-full bg-background">
                {mobileMapOpen ? renderMap() : null}
                <p
                  className="pointer-events-none absolute right-4 top-[calc(var(--safe-top)+1rem)] z-[450] rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-md"
                  role="status"
                >
                  {mapListings.length} {mapListings.length === 1 ? "annonse" : "annonser"} i kartet
                </p>
                <Button
                  type="button"
                  onClick={() => setMobileMapOpen(false)}
                  aria-label="Lukk kart og vis liste"
                  className="absolute bottom-[max(1rem,var(--safe-bottom))] left-1/2 z-[450] h-12 -translate-x-1/2 gap-2 rounded-full bg-foreground px-5 text-background shadow-lg hover:bg-foreground/90"
                >
                  <List className="size-4" aria-hidden />
                  Liste
                </Button>
              </div>
            </FullscreenOverlayContent>
          </FullscreenOverlay>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("medium");
              setMobileMapOpen(true);
            }}
            className="native-touch-target fixed bottom-[calc(var(--app-bottom-nav-h)+1rem)] left-1/2 z-50 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-lg transition active:scale-95"
            aria-label={
              mapListings.length > 0 ? `Vis kart, ${mapListings.length} treff` : "Vis kart"
            }
          >
            <MapIcon className="size-4" aria-hidden />
            Kart
          </button>
        </>
      )}
    </>
  );
}
