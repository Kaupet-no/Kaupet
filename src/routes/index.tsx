import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FolderOpen, Search } from "lucide-react";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { HeaderSearchPortal } from "@/components/site-header";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronLeft } from "lucide-react";
import { useIsNative } from "@/hooks/use-is-native";
import { AppLanding } from "@/components/app-landing";
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IntentTitleLanding } from "@/components/intent-title-landing";
import { getCategoryIcon } from "@/lib/category-icons";
import { findCategorySuggestion } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { useTypewriterText } from "@/hooks/use-typewriter-text";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import { setAttributeFilterValue } from "@/lib/category-filters";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import { PopularCarousel } from "@/components/popular-carousel";
import { HowItWorksSection, OpenSourceCtaSection } from "@/components/landing-static-sections";
import { ListingCard } from "@/components/listing-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CategoryRow } from "@/features/landing/landing-types";
import { useLandingCategories } from "@/features/landing/use-landing-categories";
import { usePopularListings } from "@/features/landing/use-popular-listings";
import { useLandingResultCount } from "@/features/landing/use-landing-result-count";
import { useCategoryFeed, type CategoryFeedSort } from "@/features/landing/use-category-feed";
import { useCategoryDrilldown } from "@/features/landing/use-category-drilldown";
import { useFilterFacetCounts } from "@/features/listing-search/use-filter-facet-counts";
import { submitSearch } from "@/features/listing-search/submit-search";
import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Kaupet.no — Gi tingene dine et nytt liv" },
      {
        name: "description",
        content:
          "Norges åpne markedsplass for brukte ting. Finn møbler, elektronikk, klær og mer fra naboer over hele landet.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const native = useIsNative();
  const [onboardingDone, setOnboardingDone] = useState(() =>
    typeof window === "undefined"
      ? false
      : localStorage.getItem("kaupet_onboarding_completed_v1") === "true",
  );

  if (native && !onboardingDone) {
    return (
      <OnboardingFlow
        onComplete={() => {
          localStorage.setItem("kaupet_onboarding_completed_v1", "true");
          setOnboardingDone(true);
        }}
      />
    );
  }

  if (native) return <AppLanding />;
  return <WebLanding />;
}

function WebLanding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adPickerOpen, setAdPickerOpen] = useState(false);
  const [qDraft, setQDraft] = useState("");
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: true }));

  const { categories, categoriesIsError, refetchCategories, allFilters } = useLandingCategories();
  const { data: vehicleBrands } = useAllVehicleBrands();

  // Only colored root categories are presented as main categories on the landing
  // page; the catch-all "Annet" (no color) stays reachable via search but is not
  // shown here.
  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parent_id === null && !!c.color),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const c of categories ?? []) {
      if (!c.parent_id) continue;
      const arr = map.get(c.parent_id) ?? [];
      arr.push(c);
      map.set(c.parent_id, arr);
    }
    return map;
  }, [categories]);
  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRow>();
    for (const c of categories ?? []) map.set(c.id, c);
    return map;
  }, [categories]);

  const {
    selectedPath,
    setSelectedPath,
    activeCategory,
    currentParent,
    categoriesOpen,
    setCategoriesOpen,
    navDirection,
    filterValues,
    setFilterValues,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    subcatRef,
    activeFilters,
    currentCategoryIds,
    goToCategory,
    goToCategoryPage,
    handlePickCategory,
    drillIntoSub,
    goBack,
    jumpToDepth,
  } = useCategoryDrilldown({ childrenByParent, categoriesById, allFilters, navigate });

  const { data: facetCounts } = useFilterFacetCounts({
    filters: activeFilters,
    values: filterValues,
    categoryIds: currentCategoryIds,
    conditions: [],
    min: priceMin,
    max: priceMax,
    includeFree: true,
  });

  const resultCount = useLandingResultCount({
    categoryIds: currentCategoryIds,
    filterValues,
    priceMin,
    priceMax,
  });

  // Sortering for kategori-feeden som erstatter "Populært akkurat nå" m.fl.
  // nedenfor når en kategori er valgt. Nullstilles til default hver gang
  // brukeren bytter til en annen rotkategori, i tråd med filter-resetten over.
  const [feedSort, setFeedSort] = useState<CategoryFeedSort>("popular");
  useEffect(() => setFeedSort("popular"), [activeCategory?.id]);
  const {
    data: feedPages,
    isError: feedIsError,
    isLoading: feedIsLoading,
    hasNextPage: feedHasNextPage,
    isFetchingNextPage: feedIsFetchingNextPage,
    fetchNextPage: feedFetchNextPage,
    refetch: refetchFeed,
  } = useCategoryFeed({ categoryIds: currentCategoryIds, sort: feedSort });
  const feedListings = useMemo(() => feedPages?.pages.flatMap((p) => p.rows) ?? [], [feedPages]);

  const [qFocused, setQFocused] = useState(false);
  const heroSearchSentinelRef = useRef<HTMLFormElement>(null);
  const [heroSearchVisible, setHeroSearchVisible] = useState(true);
  useEffect(() => {
    const sentinel = heroSearchSentinelRef.current;
    if (!sentinel) return;
    // rootMargin trekker fra headerens høyde (h-16 = 64px) pluss 10px margin,
    // slik at det sticky søkefeltet dukker opp så snart det ordinære feltet
    // er skjult bak headeren, ikke først når det forlater viewporten helt.
    const observer = new IntersectionObserver(
      ([entry]) => setHeroSearchVisible(entry.isIntersecting),
      {
        rootMargin: "-74px 0px 0px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  // Portalen holdes montert (fadet inn/ut med CSS) fremfor å monteres/
  // avmonteres, slik at inn- og ut-animasjonen faktisk får spilt av.
  const defaultSearchExamples = useDefaultSearchExamples();
  // When a category is active, hint at what's searchable within it by typing
  // its (deepest-level) subcategory names instead of the generic suggestions.
  const typewriterWords = useMemo(() => {
    if (!currentParent) return defaultSearchExamples;
    if (currentParent.search_examples?.length) {
      return currentParent.search_examples.map((w) => w.toLocaleLowerCase("nb-NO"));
    }
    const subs = childrenByParent.get(currentParent.id) ?? [];
    const words = subs.map((s) => s.name_nb.toLocaleLowerCase("nb-NO"));
    return words.length > 0 ? words : [currentParent.name_nb.toLocaleLowerCase("nb-NO")];
  }, [currentParent, childrenByParent, defaultSearchExamples]);
  const typewriterPlaceholder = useTypewriterText(typewriterWords, {
    paused: qFocused || qDraft.length > 0,
    resetKey: currentParent?.id ?? "all",
  });

  // Suggest a matching category while the user types in the hero search, so
  // people who type a category name (e.g. "sykkel") discover that browsing by
  // category is also possible from the same field.
  const heroSuggestion = useMemo(
    () => findCategorySuggestion(categories ?? [], qDraft),
    [qDraft, categories],
  );
  const { popular, popularIsError, refetchPopular } = usePopularListings();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // When a main category is active, scope the search to just that category
    // — /annonser already expands a parent category to include all of its
    // children server-side, so listing it alone (not every subcategory
    // slug too) is both sufficient and what the filter UI should display.
    void submitSearch({
      applied: {
        value: {
          ...defaultAdvancedSearchValue(),
          categories: activeCategory ? [activeCategory.slug] : [],
        },
        attributes: {},
      },
      query: qDraft,
      categories: categories ?? [],
      vehicleBrands: vehicleBrands ?? [],
      allFilters: allFilters ?? [],
      commit: (search) => navigate({ to: "/annonser", search }),
    });
  };

  return (
    <div>
      <HeaderSearchPortal>
        <form
          onSubmit={handleSearchSubmit}
          aria-hidden={heroSearchVisible}
          inert={heroSearchVisible}
          className={`mx-auto flex max-w-md gap-2 transition-opacity duration-200 ${
            heroSearchVisible ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder={typewriterPlaceholder}
              className="h-9 rounded-full border-border bg-card pl-9 text-sm"
              aria-label="Søk i annonser"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            aria-label="Søk"
          >
            <ArrowRight className="size-4" />
          </Button>
        </form>
      </HeaderSearchPortal>
      {/* Hero — søkefeltet får all oppmerksomheten, som en søkemotor */}
      <section className="bg-surface">
        <div className="density-editorial mx-auto max-w-3xl px-4 text-center">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Gi tingene dine <span className="italic text-accent">et nytt liv</span>.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Finn noe du trenger, eller gi noe videre.
          </p>

          <form
            ref={heroSearchSentinelRef}
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-6 flex max-w-lg gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onFocus={() => setQFocused(true)}
                onBlur={() => setQFocused(false)}
                placeholder={typewriterPlaceholder}
                className="h-12 rounded-full border-border bg-card pl-9 text-base shadow-sm transition-shadow hover:shadow-md focus-visible:shadow-md"
                aria-label="Søk i annonser"
              />
              {qFocused && heroSuggestion && (
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full overflow-hidden rounded-xl border border-border bg-card p-1 text-left shadow-md">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goToCategory(heroSuggestion);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    <span>
                      Gå til kategori: <span className="font-medium">{heroSuggestion.name_nb}</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <Button type="submit" size="lg" className="shrink-0 gap-2">
              Søk <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {user ? (
              <>
                <Button size="lg" variant="outline" onClick={() => setAdPickerOpen(true)}>
                  Opprett en annonse
                </Button>
                <Dialog open={adPickerOpen} onOpenChange={setAdPickerOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogTitle className="sr-only">Opprett annonse</DialogTitle>
                    <IntentTitleLanding onNavigate={() => setAdPickerOpen(false)} />
                  </DialogContent>
                </Dialog>
                <KaupetCodeDialog />
              </>
            ) : (
              <>
                <Button asChild variant="outline" size="lg">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Opprett en annonse
                  </Link>
                </Button>
                <KaupetCodeDialog />
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="category-heading" className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-accent-text text-xs font-semibold tracking-wide uppercase">
              Finn raskere
            </p>
            <h2 id="category-heading" className="mt-1 font-display text-3xl tracking-tight">
              Utforsk kategorier
            </h2>
          </div>
          <Link
            to="/annonser"
            search={{ q: "", category: "", sort: "new" }}
            className="text-sm text-primary hover:underline"
          >
            Alle annonser →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {categoriesIsError && (
            <div className="col-span-full flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">Klarte ikke å hente kategorier.</p>
              <Button variant="outline" size="sm" onClick={() => void refetchCategories()}>
                Prøv igjen
              </Button>
            </div>
          )}
          {!categoriesIsError &&
            rootCategories.length === 0 &&
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="min-h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          {rootCategories.map((cat) => {
            const Icon = getCategoryIcon(cat.icon);
            const active = activeCategory?.id === cat.id;
            const tint = cat.color ?? "var(--primary)";
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handlePickCategory(cat)}
                aria-expanded={active}
                className={`group flex min-h-20 min-w-0 items-center gap-3 rounded-xl border px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active
                    ? "border-[var(--cat-tint)] bg-muted"
                    : "border-border bg-card hover:bg-muted"
                }`}
                style={{ "--cat-tint": tint } as React.CSSProperties}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    active
                      ? "bg-[var(--cat-tint)] text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-[var(--cat-tint)] group-hover:text-primary-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 break-words text-sm font-medium leading-snug text-foreground">
                  {cat.name_nb}
                </span>
              </button>
            );
          })}
        </div>

        <Collapsible
          open={categoriesOpen}
          onOpenChange={(o) => {
            setCategoriesOpen(o);
            if (!o) {
              setSelectedPath([]);
              setFilterValues({});
              setPriceMin(undefined);
              setPriceMax(undefined);
            }
          }}
        >
          <CollapsibleContent>
            {currentParent && (
              <div className="mt-5" ref={subcatRef}>
                <form
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    goToCategoryPage(selectedPath);
                  }}
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Valgt kategori
                      </p>
                      <h3 className="mt-1 font-display text-2xl tracking-tight">
                        {currentParent.name_nb}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex items-center gap-1 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="size-4" />
                      {selectedPath.length > 1
                        ? `Tilbake til ${selectedPath[selectedPath.length - 2].name_nb}`
                        : "Lukk"}
                    </button>
                  </div>

                  {selectedPath.length > 1 && (
                    <div className="mb-5 flex flex-wrap items-center gap-1.5">
                      {selectedPath.map((c, i) => (
                        <Badge
                          key={c.id}
                          variant={i === selectedPath.length - 1 ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => jumpToDepth(i)}
                        >
                          {c.name_nb}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {selectedPath.length === 1 &&
                  (childrenByParent.get(currentParent.id) ?? []).length > 0 ? (
                    <div
                      key={currentParent.id}
                      className={`duration-200 animate-in fade-in ${
                        navDirection === "forward"
                          ? "slide-in-from-right-2"
                          : "slide-in-from-left-2"
                      }`}
                    >
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                        {(childrenByParent.get(currentParent.id) ?? []).map((sub) => {
                          const SubIcon = getCategoryIcon(sub.icon);
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => drillIntoSub(sub)}
                              className="group flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-background px-2 py-3 text-center transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <span
                                className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:bg-[var(--cat-tint)] group-hover:text-primary-foreground"
                                style={
                                  {
                                    "--cat-tint": currentParent.color ?? "var(--primary)",
                                  } as React.CSSProperties
                                }
                              >
                                <SubIcon className="size-5" />
                              </span>
                              <span className="break-words text-xs font-medium leading-snug text-foreground">
                                {sub.name_nb}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                        <span className="text-sm text-muted-foreground">
                          {resultCount === undefined
                            ? "Beregner antall treff …"
                            : `${resultCount} treff akkurat nå`}
                        </span>
                        <Button type="submit" variant="outline" size="sm">
                          {resultCount === undefined
                            ? "Vis alt i " + currentParent.name_nb
                            : `Vis ${resultCount} treff`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={currentParent.id}
                      className={`grid gap-6 duration-200 animate-in fade-in md:grid-cols-[240px_1fr] ${
                        navDirection === "forward"
                          ? "slide-in-from-right-2"
                          : "slide-in-from-left-2"
                      }`}
                    >
                      <div className="flex flex-col gap-1 md:border-r md:border-border md:pr-6">
                        <button
                          type="button"
                          onClick={() => goToCategoryPage(selectedPath)}
                          className="rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Alt i {currentParent.name_nb}
                        </button>
                        {(childrenByParent.get(currentParent.id) ?? []).map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => drillIntoSub(sub)}
                            className="rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {sub.name_nb}
                          </button>
                        ))}
                      </div>

                      <div className="min-w-0">
                        <AttributeFilterChips
                          filters={activeFilters}
                          values={filterValues}
                          onChange={(key, v) =>
                            setFilterValues((prev) => setAttributeFilterValue(prev, key, v))
                          }
                          layout="card"
                          embedCard
                          hideCondition
                          min={priceMin}
                          max={priceMax}
                          onPriceChange={(mn, mx) => {
                            setPriceMin(mn);
                            setPriceMax(mx);
                          }}
                          onReset={() => {
                            setFilterValues({});
                            setPriceMin(undefined);
                            setPriceMax(undefined);
                          }}
                          counts={facetCounts}
                          footerLeft={
                            <span className="text-sm text-muted-foreground">
                              {resultCount === undefined
                                ? "Beregner antall treff …"
                                : `${resultCount} treff akkurat nå`}
                            </span>
                          }
                          footerRight={
                            <Button type="submit" variant="outline" size="sm">
                              {resultCount === undefined ? "Vis treff" : `Vis ${resultCount} treff`}
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  )}
                </form>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

      {activeCategory ? (
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-16">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Annonser i {activeCategory.name_nb}</h2>
            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => setFeedSort("popular")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  feedSort === "popular"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Populært
              </button>
              <button
                type="button"
                onClick={() => setFeedSort("new")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  feedSort === "new"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Nyest
              </button>
            </div>
          </div>

          {feedIsError && (
            <EmptyState
              title="Klarte ikke å hente annonser."
              action={
                <Button variant="outline" size="sm" onClick={() => void refetchFeed()}>
                  Prøv igjen
                </Button>
              }
            />
          )}

          {!feedIsError && feedIsLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {!feedIsError && !feedIsLoading && feedListings.length === 0 && (
            <EmptyState title="Ingen annonser i denne kategorien ennå." />
          )}

          {!feedIsError && feedListings.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {feedListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
              {feedHasNextPage && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void feedFetchNextPage()}
                    disabled={feedIsFetchingNextPage}
                  >
                    {feedIsFetchingNextPage ? "Laster …" : "Last inn flere annonser"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          {/* Populært akkurat nå — egen seksjon, lenger ned slik at søkefeltet
              eier hero-seksjonen alene */}
          <section className="mx-auto max-w-6xl px-4 pb-16 pt-10">
            <PopularCarousel
              popular={popular}
              isError={popularIsError}
              onRetry={() => void refetchPopular()}
              autoplay={autoplay}
            />
          </section>

          <HowItWorksSection />
          <OpenSourceCtaSection />
        </>
      )}
    </div>
  );
}
