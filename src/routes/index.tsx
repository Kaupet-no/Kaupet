import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FolderOpen, Hash, Search } from "lucide-react";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import { OnboardingFlow } from "@/components/onboarding-flow";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronLeft } from "lucide-react";
import { useIsNative } from "@/hooks/use-is-native";
import { AppLanding } from "@/components/app-landing";
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdPickerOptions } from "@/components/ad-picker-options";
import { getCategoryIcon } from "@/lib/category-icons";
import { findCategorySuggestion } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { useTypewriterText } from "@/hooks/use-typewriter-text";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import { categoryHeadingFontStack } from "@/lib/category-fonts";
import { CategoryFilterFields, MoreFiltersToggle } from "@/components/category-filter-fields";
import { setAttributeFilterValue } from "@/lib/category-filters";
import { PopularCarousel } from "@/components/popular-carousel";
import { HowItWorksSection, OpenSourceCtaSection } from "@/components/landing-static-sections";
import { ListingCard } from "@/components/listing-card";
import type { CategoryRow } from "@/features/landing/landing-types";
import { useLandingCategories } from "@/features/landing/use-landing-categories";
import { usePopularListings } from "@/features/landing/use-popular-listings";
import { useLandingResultCount } from "@/features/landing/use-landing-result-count";
import { useCategoryFeed, type CategoryFeedSort } from "@/features/landing/use-category-feed";
import { useCategoryDrilldown } from "@/features/landing/use-category-drilldown";

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
    primaryFilters,
    secondaryFilters,
    moreFiltersOpen,
    setMoreFiltersOpen,
    currentCategoryIds,
    goToCategory,
    goToCategoryPage,
    handlePickCategory,
    drillIntoSub,
    goBack,
    jumpToDepth,
  } = useCategoryDrilldown({ childrenByParent, categoriesById, allFilters, navigate });

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

  // Icons stay neutral/monochrome at rest so the row doesn't compete with the
  // search field for attention; each category's configured color only shows
  // up once the user engages with it (hover or active selection), so the
  // color still signals "this one is picked" without nine hues firing at once.
  const renderCategoryIcon = (cat: CategoryRow) => {
    const Icon = getCategoryIcon(cat.icon);
    const active = activeCategory?.id === cat.id;
    const tint = cat.color ?? "var(--primary)";
    return (
      <button
        key={cat.id}
        type="button"
        onClick={() => handlePickCategory(cat)}
        aria-expanded={active}
        className="group flex w-16 flex-col items-center gap-1.5 text-center"
      >
        <span
          className={`flex size-10 items-center justify-center rounded-full transition ${
            active
              ? "bg-[var(--cat-tint)] text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:bg-[var(--cat-tint)] group-hover:text-primary-foreground"
          }`}
          style={{ "--cat-tint": tint } as React.CSSProperties}
        >
          <Icon className="size-4" />
        </span>
        <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground">
          {cat.name_nb}
        </span>
      </button>
    );
  };

  const { popular, popularIsError, refetchPopular } = usePopularListings();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // When a main category is active, scope the search to just that category
    // — /annonser already expands a parent category to include all of its
    // children server-side, so listing it alone (not every subcategory
    // slug too) is both sufficient and what the filter UI should display.
    navigate({
      to: "/annonser",
      search: { q: qDraft.trim(), category: activeCategory?.slug ?? "", sort: "new" },
    });
  };

  return (
    <div>
      {/* Hero — søkefeltet får all oppmerksomheten, som en søkemotor */}
      <section className="relative overflow-hidden bg-surface">
        {/* Per-category background tint that animates in from the left when a
            main category is selected. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-left transition-[transform,background-color,opacity] duration-700 ease-out"
          style={{
            background: activeCategory?.color ?? "transparent",
            opacity: activeCategory ? 0.16 : 0,
            transform: activeCategory ? "translateX(0)" : "translateX(-100%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-2xl px-4 py-14 text-center md:py-20">
          {/* Hero text and the category heading are mutually exclusive, each
              sliding in from the direction matching the background tint and
              the subcategory grid below, so picking a category visibly moves
              the page into a more focused area. */}
          {activeCategory ? (
            <h1
              key={activeCategory.id}
              className="text-5xl leading-[1.05] tracking-tight duration-700 animate-in fade-in slide-in-from-right-4 md:text-6xl"
              style={{ fontFamily: categoryHeadingFontStack(activeCategory.heading_font) }}
            >
              /{activeCategory.name_nb}
            </h1>
          ) : (
            <div key="hero" className="duration-700 animate-in fade-in slide-in-from-left-4">
              <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
                Gi tingene dine <span className="italic text-accent">et nytt liv</span>.
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Det er alltid gratis å annonsere på Kaupet, uansett hva du selger.
              </p>
            </div>
          )}

          <form onSubmit={submitSearch} className="mx-auto mt-6 flex max-w-lg gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onFocus={() => setQFocused(true)}
                onBlur={() => setQFocused(false)}
                placeholder={typewriterPlaceholder ? `f.eks. ${typewriterPlaceholder}` : ""}
                className="h-12 border-border bg-card pl-9 text-base shadow-md"
                aria-label="Søk i annonser"
              />
              {qFocused && heroSuggestion && (
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full overflow-hidden rounded-xl border border-border bg-card p-1 text-left shadow-md">
                  <button
                    type="button"
                    // Mouse-down fires before the input's blur, so the click
                    // registers instead of being lost when focus leaves the field.
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
            <Button type="submit" size="lg" className="gap-2">
              Søk <ArrowRight className="size-4" />
            </Button>
          </form>

          {/* Hovedkategorier — på mobil én horisontal, sveipbar rad med
              kant-fade som viser at det finnes flere; fra sm og opp brytes
              raden slik at alle kategoriene alltid er synlige uten scroll.
              Underkategorier ligger bak hvert valg. */}
          <div className="relative mx-auto mt-5 max-w-lg sm:max-w-2xl">
            <div
              className="flex gap-4 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:overflow-visible"
              style={{ scrollSnapType: "x proximity" }}
            >
              {categoriesIsError && (
                <div className="flex w-full flex-col items-center gap-2 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Klarte ikke å hente kategorier.</p>
                  <Button variant="outline" size="sm" onClick={() => void refetchCategories()}>
                    Prøv igjen
                  </Button>
                </div>
              )}
              {!categoriesIsError &&
                rootCategories.length === 0 &&
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <div className="size-10 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              {rootCategories.map((cat) => (
                <div key={cat.id} className="shrink-0" style={{ scrollSnapAlign: "start" }}>
                  {renderCategoryIcon(cat)}
                </div>
              ))}
              {/* Alltid synlig inngang til det fulle kategoritreet — dekker
                  også kategorier uten farge (f.eks. "Annet") som ikke vises
                  i raden over. */}
              <div className="shrink-0" style={{ scrollSnapAlign: "start" }}>
                <Link
                  to="/annonser"
                  search={{ q: "", category: "", sort: "new" }}
                  className="group flex w-16 flex-col items-center gap-1.5 text-center"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <FolderOpen className="size-4" />
                  </span>
                  <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground">
                    Se alle
                  </span>
                </Link>
              </div>
            </div>
            {/* Kant-fade — kun mobil, hinter om at raden kan sveipes videre.
                Skjules mens en kategori er valgt, siden fargen ellers ville
                kollidert med kategoritinten bak. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent transition-opacity sm:hidden"
              style={{ opacity: activeCategory ? 0 : 1 }}
            />
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
                // Underkategorier + filtre — bryter ut av hero-kolonnens
                // max-w-2xl slik at panelet blir like bredt som seksjonene
                // lenger ned på siden (max-w-6xl); selve kortet under har sin
                // egen border/shadow, så den fulle bredden leser som en
                // bevisst "hylle" panelet står på, ikke bare et tomrom.
                <div
                  className="relative left-1/2 -ml-[50vw] mt-3 w-screen text-left"
                  ref={subcatRef}
                >
                  <div className="mx-auto max-w-6xl px-4">
                    <form
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const root = selectedPath[0];
                        navigate({
                          to: "/$kaupetCode",
                          params: { kaupetCode: root.slug },
                          search: {
                            f: filterValues,
                            priceMin,
                            priceMax,
                            sub: currentParent.id === root.id ? undefined : currentParent.slug,
                          },
                        });
                      }}
                    >
                      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <button
                          type="button"
                          onClick={goBack}
                          className="flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                        >
                          <ChevronLeft className="size-3.5" />
                          {selectedPath.length > 1
                            ? `Tilbake til ${selectedPath[selectedPath.length - 2].name_nb}`
                            : "Lukk"}
                        </button>

                        {selectedPath.length > 1 && (
                          <div className="flex flex-wrap items-center gap-1.5">
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
                      </div>

                      {/* Kun hovedkategori valgt (ingen underkategori
                          drillet inn på ennå) — vi har ikke noe relevant
                          søkeparameter å vise på dette nivået (de er
                          konfigurert per underkategori), så nivå
                          2-kategoriene vises som en ikonoversikt i stedet
                          for filterpanelet. */}
                      {selectedPath.length === 1 &&
                      (childrenByParent.get(currentParent.id) ?? []).length > 0 ? (
                        <div
                          key={currentParent.id}
                          className={`duration-700 animate-in fade-in ${
                            navDirection === "forward"
                              ? "slide-in-from-right-4"
                              : "slide-in-from-left-4"
                          }`}
                        >
                          <div className="flex flex-wrap justify-center gap-x-5 gap-y-4 sm:justify-start">
                            {(childrenByParent.get(currentParent.id) ?? []).map((sub) => {
                              const SubIcon = getCategoryIcon(sub.icon);
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => drillIntoSub(sub)}
                                  className="group flex w-20 flex-col items-center gap-1.5 text-center"
                                >
                                  <span
                                    className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-[var(--cat-tint)] group-hover:text-primary-foreground"
                                    style={
                                      {
                                        "--cat-tint": currentParent.color ?? "var(--primary)",
                                      } as React.CSSProperties
                                    }
                                  >
                                    <SubIcon className="size-6" />
                                  </span>
                                  <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground">
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
                                : `${resultCount} ${resultCount === 1 ? "treff" : "treff"} akkurat nå`}
                            </span>
                            <Button type="submit" variant="outline">
                              {resultCount === undefined
                                ? "Vis alt i " + currentParent.name_nb
                                : `Vis ${resultCount} treff`}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={currentParent.id}
                          className={`grid gap-6 duration-700 animate-in fade-in md:grid-cols-[240px_1fr] ${
                            navDirection === "forward"
                              ? "slide-in-from-right-4"
                              : "slide-in-from-left-4"
                          }`}
                        >
                          {/* Venstre kolonne — underkategorier som en vertikal
                              liste, så den leser som navigasjon, ikke som nok
                              et sett filter-chips oppå breadcrumb-badgene. */}
                          <div className="flex flex-col gap-1 md:border-r md:border-border md:pr-6">
                            <button
                              type="button"
                              onClick={() => goToCategoryPage(selectedPath)}
                              className="rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-primary transition hover:bg-primary/10"
                            >
                              Alt i {currentParent.name_nb}
                            </button>
                            {(childrenByParent.get(currentParent.id) ?? []).map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => drillIntoSub(sub)}
                                className="rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition hover:bg-muted"
                              >
                                {sub.name_nb}
                              </button>
                            ))}
                          </div>

                          {/* Høyre kolonne — filtre gruppert i et rutenett i
                              stedet for én lang vertikal stabel. */}
                          <div className="min-w-0">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>Pris (kr)</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    placeholder="Fra"
                                    value={priceMin ?? ""}
                                    onChange={(e) =>
                                      setPriceMin(
                                        e.target.value === "" ? undefined : Number(e.target.value),
                                      )
                                    }
                                  />
                                  <Input
                                    type="number"
                                    placeholder="Til"
                                    value={priceMax ?? ""}
                                    onChange={(e) =>
                                      setPriceMax(
                                        e.target.value === "" ? undefined : Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>
                              </div>
                              <CategoryFilterFields
                                filters={primaryFilters}
                                values={filterValues}
                                onChange={(key, v) =>
                                  setFilterValues((prev) => setAttributeFilterValue(prev, key, v))
                                }
                              />
                            </div>
                            {secondaryFilters.length > 0 && (
                              <Collapsible
                                open={moreFiltersOpen}
                                onOpenChange={setMoreFiltersOpen}
                                className="mt-4"
                              >
                                <MoreFiltersToggle
                                  open={moreFiltersOpen}
                                  count={secondaryFilters.length}
                                />
                                <CollapsibleContent className="grid gap-4 pt-4 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out sm:grid-cols-2">
                                  <CategoryFilterFields
                                    filters={secondaryFilters}
                                    values={filterValues}
                                    onChange={(key, v) =>
                                      setFilterValues((prev) =>
                                        setAttributeFilterValue(prev, key, v),
                                      )
                                    }
                                  />
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                              <span className="text-sm text-muted-foreground">
                                {resultCount === undefined
                                  ? "Beregner antall treff …"
                                  : `${resultCount} ${resultCount === 1 ? "treff" : "treff"} akkurat nå`}
                              </span>
                              <Button type="submit">
                                {resultCount === undefined
                                  ? "Vis treff"
                                  : `Vis ${resultCount} treff`}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {!activeCategory ? (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {user ? (
                <>
                  <Button size="lg" variant="outline" onClick={() => setAdPickerOpen(true)}>
                    Opprett en annonse
                  </Button>
                  <Dialog open={adPickerOpen} onOpenChange={setAdPickerOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Ny annonse</DialogTitle>
                      </DialogHeader>
                      <AdPickerOptions
                        onSell={() => {
                          setAdPickerOpen(false);
                          void navigate({ to: "/ny-annonse", search: { type: "sell" } });
                        }}
                        onBuy={() => {
                          setAdPickerOpen(false);
                          void navigate({ to: "/ny-ok-annonse" });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                  <KaupetCodeDialog />
                </>
              ) : (
                <>
                  {/* Primær CTA — én tydelig handling ("bli med"), fremhevet
                      med solid stil siden det er den vi vil at de fleste
                      besøkende skal ta. Kaupet-kode er en sekundær, sjeldnere
                      brukt handling (åpne en spesifikk annonse) og skal derfor
                      ikke konkurrere visuelt med den. */}
                  <Link to="/auth" search={{ mode: "signup" }}>
                    <Button size="lg">Kom i gang</Button>
                  </Link>
                  <KaupetCodeDialog
                    trigger={
                      <Button variant="ghost" size="lg" className="gap-2">
                        <Hash className="size-4" />
                        Har du en Kaupet-kode?
                      </Button>
                    }
                  />
                </>
              )}
            </div>
          ) : (
            !user && (
              // Slank versjon av signup-CTA-en over — holdes synlig mens en
              // kategori utforskes, slik at ikke-innloggede ikke mister
              // registreringsinngangen bak filterpanelet.
              <div className="mt-4 flex justify-center">
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Button variant="outline" size="sm">
                    Kom i gang på Kaupet
                  </Button>
                </Link>
              </div>
            )
          )}
        </div>
      </section>

      {activeCategory ? (
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-16">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Annonser i {activeCategory.name_nb}</h2>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setFeedSort("popular")}
                className={`rounded-md px-3 py-1.5 transition ${
                  feedSort === "popular"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Populært
              </button>
              <button
                type="button"
                onClick={() => setFeedSort("new")}
                className={`rounded-md px-3 py-1.5 transition ${
                  feedSort === "new"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Nyest
              </button>
            </div>
          </div>

          {feedIsError && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-10 text-center">
              <p className="text-sm text-muted-foreground">Klarte ikke å hente annonser.</p>
              <Button variant="outline" size="sm" onClick={() => void refetchFeed()}>
                Prøv igjen
              </Button>
            </div>
          )}

          {!feedIsError && feedIsLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {!feedIsError && !feedIsLoading && feedListings.length === 0 && (
            <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
              Ingen annonser i denne kategorien ennå.
            </p>
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
          <section className="mx-auto max-w-6xl px-4 pb-16">
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
