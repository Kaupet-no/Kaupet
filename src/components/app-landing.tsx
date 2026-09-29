import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, History, MapPin, Search as SearchIcon } from "lucide-react";

import { ListingCard } from "@/components/listing-card";
import { usePopularListings } from "@/features/landing/use-popular-listings";
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { AnimatedSearchPlaceholder } from "@/components/animated-search-placeholder";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";
import { useScrollFadeOpacity } from "@/hooks/use-scroll-fade-opacity";
import { useFormFactor } from "@/hooks/use-form-factor";
import { AppHeroLogo } from "@/components/app-hero-logo";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import {
  saveRecentCategory,
  saveSearchToHistory,
} from "@/features/listing-search/search-panel/search-history";
import { SearchSuggestionsLayer } from "@/features/listing-search/search-suggestions-layer";
import { criteriaToValue } from "@/components/advanced-search-value";
import { CategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/lib/categories";
import { readLastSearchContext } from "@/lib/last-search-context";
import type { SavedSearch } from "@/lib/saved-searches";
import { SavedSearchRow } from "@/features/listing-search/search-start";
import {
  searchStartRowClass,
  useSavedSearchesWithUnread,
} from "@/features/listing-search/use-saved-searches-with-unread";
import { submitSearch } from "@/features/listing-search/submit-search";
import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { NewListingDialog } from "@/components/new-listing-dialog";
import { Button } from "@/components/ui/button";

/** Populære annonser hentes først når brukeren har scrollet så langt —
 * forsiden skal være rolig ved appstart, ikke laste annonser med en gang. */
const POPULAR_LOAD_AFTER_SCROLL_PX = 100;
/** Fade-lengde til heroen er oppmålt (fallback før første layout). */
const HERO_FADE_FALLBACK_PX = 180;
/** Kortest tillatte fade — kun aktuelt på svært lave viewports (telefon i
 * liggende), der kontaktpunktet selv er kortere enn normalen. */
const HERO_FADE_MIN_PX = 24;
/** Heroen skal være helt borte så mange piksler før kategoriraden ligger
 * over den, slik at logo og søk aldri synes under annet innhold. */
const HERO_FADE_CLEARANCE_PX = 48;

export function AppLanding({
  adPickerOpen,
  onAdPickerOpenChange,
}: {
  adPickerOpen: boolean;
  onAdPickerOpenChange: (open: boolean) => void;
}) {
  const { openPanel, savedLocation } = useSearchPanel();
  const [searchFocused, setSearchFocused] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  // Søkefeltet skal aldri tones ut mens brukeren faktisk bruker det: fokus og
  // åpent tastatur holder heroen fullt synlig uansett scroll.
  const searchActive = searchFocused || keyboardVisible;

  // Populære annonser hentes først ved scroll (se POPULAR_LOAD_AFTER_SCROLL_PX)
  // — ikke straks appen åpner. `window.scrollY` ved init dekker iOS sin
  // gjenopprettede scrollposisjon når brukeren kommer tilbake til forsiden.
  const [userScrolled, setUserScrolled] = useState(
    () => typeof window !== "undefined" && window.scrollY > POPULAR_LOAD_AFTER_SCROLL_PX,
  );
  useEffect(() => {
    if (userScrolled) return;
    const onScroll = () => {
      if (window.scrollY > POPULAR_LOAD_AFTER_SCROLL_PX) setUserScrolled(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [userScrolled]);

  const { popular, popularIsError, refetchPopular, hasPopularitySignal } = usePopularListings(
    10,
    userScrolled,
  );

  // Heroen (logo + søk) står i ro i første skjermbilde mens resten av siden
  // scroller opp bak. Fade-lengden måles fra hvor søkefeltet slutter til hvor
  // kategoriraden begynner, minus en margin: heroen er da helt borte før
  // noe som helst kommer over den, og aldri to elementer synes overlappet.
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [heroFadeDistance, setHeroFadeDistance] = useState(HERO_FADE_FALLBACK_PX);
  useLayoutEffect(() => {
    const measure = () => {
      const hero = heroRef.current;
      const content = contentRef.current;
      if (!hero || !content) return;
      const pxUntilContact =
        content.getBoundingClientRect().top - hero.getBoundingClientRect().bottom;
      // Aldri lenger enn veien til kontakt minus margin — ellers kom
      // innholdet over en hero som ennå ikke var helt uttonet.
      setHeroFadeDistance(Math.max(HERO_FADE_MIN_PX, pxUntilContact - HERO_FADE_CLEARANCE_PX));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const scrollFade = useScrollFadeOpacity(heroFadeDistance);
  const heroOpacity = searchActive ? 1 : scrollFade;
  const heroGone = heroOpacity < 0.05;
  const isTablet = useFormFactor() === "tablet";
  // Telefon: så mange kort i bredden som får plass på minst 9.5rem hver — én
  // kolonne under 360 px, to på vanlige telefoner og flere i liggende modus.
  const gridClass = isTablet
    ? "grid grid-cols-3 gap-4 lg:grid-cols-4 xl:grid-cols-5"
    : "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4";
  const searchExamples = useDefaultSearchExamples();
  const navigate = useNavigate();
  const [qDraft, setQDraft] = useState("");
  const { data: allCategoriesRaw } = useCategories();
  const categories = useMemo(
    () => visibleCategories(allCategoriesRaw ?? [], false),
    [allCategoriesRaw],
  );
  const { data: allFilters } = useAllCategoryFilters();
  const { data: vehicleBrands } = useAllVehicleBrands();
  // Samme vei som søkepanelets fritekst: teksten tolkes til filtre, og valgt
  // lokasjon følger med til /annonser.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    blurActiveElement();
    runSearch(qDraft);
  };
  const runSearch = (text: string) => {
    const query = text.trim();
    saveSearchToHistory(query);
    void submitSearch({
      query,
      applied: {
        value: { ...defaultAdvancedSearchValue(), location: savedLocation },
        attributes: {},
      },
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters: allFilters ?? [],
      commit: (search) => navigate({ to: "/annonser", search }),
    });
  };
  const hasLocation = savedLocation.lat != null && savedLocation.lng != null;
  const locationLabel = hasLocation
    ? `${savedLocation.label || "Valgt sted"} · ${savedLocation.radius} km`
    : "Hele Norge";

  // `popular` er `undefined` mens spørringen laster og `[]` når katalogen
  // faktisk er tom, og også `undefined` når spørringen feiler — en feil skal
  // tilby et nytt forsøk, ikke pulsere i det uendelige.
  const isLoadingPopular = popular === undefined && !popularIsError;
  const hasListings = !!popular && popular.length > 0;
  const hasSectionBelow = isLoadingPopular || hasListings || popularIsError;

  const mainCategories = categories.filter((category) => category.parent_id == null);
  const goToCategory = (category: Category) => {
    saveRecentCategory(category.slug);
    navigate({ to: "/annonser", search: { q: "", category: category.slug, sort: "new" } });
  };
  const runSavedSearch = (saved: SavedSearch) =>
    void submitSearch({
      applied: {
        value: criteriaToValue(saved.criteria),
        attributes: saved.criteria.attributes ?? {},
      },
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters: allFilters ?? [],
      commit: (search) => navigate({ to: "/annonser", search }),
    });

  return (
    <div className="pb-3">
      {/* Første skjermbilde eies av logo og søkefelt, midt på siden (UI-guiden
          § Visuell rytme). Heroen er festet til viewporten mens resten av
          siden scroller opp bak den, og tones rolig ut — målt slik at den er
          helt borte før kategoriraden kommer over, så logo og søk aldri
          synes under annet innhold. */}
      <div
        data-testid="home-hero"
        aria-hidden={heroGone || undefined}
        inert={heroGone || undefined}
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center px-5 pt-safe pb-bottom-nav"
        style={{ opacity: heroOpacity, transition: "opacity 150ms ease" }}
      >
        <div
          ref={heroRef}
          className={`flex w-full flex-col items-center gap-3 ${isTablet ? "max-w-xl" : ""}`}
        >
          <AppHeroLogo />
          <h1 className="sr-only">Hva leter du etter i dag?</h1>
          <form
            role="search"
            onSubmit={handleSearchSubmit}
            className="relative flex h-14 w-full max-w-xl items-center rounded-full border border-border bg-card px-4 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
            style={{ pointerEvents: "auto" }}
          >
            <SearchIcon className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                enterKeyHint="search"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                aria-label="Søk i annonser"
                className="w-full bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {!qDraft && (
                <span className="pointer-events-none absolute inset-0 flex items-center">
                  <AnimatedSearchPlaceholder
                    words={searchExamples}
                    paused={searchFocused}
                    className="text-base text-muted-foreground"
                  />
                </span>
              )}
            </div>
            {searchFocused && (
              <SearchSuggestionsLayer
                q={qDraft}
                categories={categories}
                onSubmitQuery={(text) => {
                  blurActiveElement();
                  setQDraft(text);
                  runSearch(text);
                }}
                onPickCategory={(category) => {
                  blurActiveElement();
                  goToCategory(category);
                }}
                onPickSavedSearch={(saved) => {
                  blurActiveElement();
                  runSavedSearch(saved);
                }}
              />
            )}
          </form>
        </div>
      </div>

      {/* Reserverer hele første skjermbilde til heroen. */}
      <div aria-hidden="true" className="h-[calc(100dvh-var(--app-bottom-nav-h))]" />

      {/* Innholdet scroller opp over heroen; uigjennomsiktig bakgrunn og
          høyere z-index holder det alltid over den uttonede heroen. */}
      <div ref={contentRef} className="density-task relative z-10 bg-background px-5 pb-3 pt-6">
        {/* Sted først: et lagret sted gjelder hvert søk herfra og skal synes.
            Deretter hovedkategoriene som en vannrett rad, som går rett til
            resultater med kategorien valgt. */}
        <div className={isTablet ? "mx-auto max-w-xl" : ""}>
          <div
            role="group"
            aria-label="Kategorier"
            className="-mx-5 flex w-[calc(100%+2.5rem)] gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => openPanel("location")}
              aria-label={`Velg lokasjon: ${locationLabel}`}
              className="native-touch-target flex w-16 shrink-0 flex-col items-center gap-2 text-center"
            >
              <span
                className={`flex size-14 items-center justify-center rounded-2xl ${
                  hasLocation ? "bg-primary text-primary-foreground" : "bg-muted text-primary"
                }`}
              >
                <MapPin className="size-6" aria-hidden="true" />
              </span>
              <span className="line-clamp-2 text-xs leading-tight">
                {hasLocation ? savedLocation.label || "Valgt sted" : "Hele Norge"}
              </span>
            </button>
            {mainCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => goToCategory(category)}
                className="native-touch-target flex w-16 shrink-0 flex-col items-center gap-2 text-center"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-primary">
                  <CategoryIcon iconName={category.icon} className="size-6" aria-hidden="true" />
                </span>
                <span className="line-clamp-2 text-xs leading-tight">{category.name_nb}</span>
              </button>
            ))}
          </div>
        </div>

        {hasSectionBelow && (
          <section
            className={`bg-background ${isTablet ? "mt-2" : "pt-2"}`}
            aria-labelledby="popular-heading"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="popular-heading" className="font-display text-lg tracking-tight">
                {hasPopularitySignal ? "Populært nå" : "Nye annonser"}
              </h2>
              <button
                type="button"
                onClick={() => navigate({ to: "/annonser", search: { q: "", sort: "new" } })}
                className="native-touch-target px-2 text-xs text-primary"
              >
                Se alle →
              </button>
            </div>
            {popularIsError ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Klarte ikke å hente populære annonser akkurat nå.
                </p>
                <Button variant="outline" size="sm" onClick={() => void refetchPopular()}>
                  Prøv igjen
                </Button>
              </div>
            ) : hasListings ? (
              <>
                <div className={`${gridClass} ${isTablet ? "pb-2" : ""}`}>
                  {popular.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
                <div className="flex justify-center pb-4 pt-6">
                  <Button asChild variant="outline" className="h-12 rounded-full px-6">
                    <Link to="/annonser">Vis alle annonser</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className={gridClass}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            )}
          </section>
        )}

        <div className={isTablet ? "mx-auto max-w-xl" : ""}>
          <ResumeSearch onPickSavedSearch={runSavedSearch} />

          <KaupetCodeDialog
            trigger={
              <button
                type="button"
                className="native-touch-target mt-2 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Har du en Kaupet-kode?
              </button>
            }
          />
        </div>
      </div>

      <NewListingDialog open={adPickerOpen} onOpenChange={onAdPickerOpenChange} />
    </div>
  );
}

/** Lukker tastaturet og forslagene etter et valg i forslagslaget. */
function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/**
 * «Fortsett der du slapp»: lagrede søk med nye treff for innloggede, ellers
 * siste søk i denne økten. Den raskeste veien tilbake til et søk brukeren
 * allerede har bygget, i stedet for å starte på nytt fra et tomt felt.
 */
function ResumeSearch({ onPickSavedSearch }: { onPickSavedSearch: (saved: SavedSearch) => void }) {
  const navigate = useNavigate();
  const saved = useSavedSearchesWithUnread(2);
  // sessionStorage finnes bare i nettleseren; forsiden rendres på klienten.
  // Et søk uten kriterier («annonser») er ikke noe å fortsette på.
  const [lastSearch] = useState(() => {
    const context = readLastSearchContext();
    return context && context.label !== "annonser" ? context : null;
  });
  if (saved.length === 0 && !lastSearch) return null;

  return (
    <section aria-labelledby="resume-heading" className="mt-5 w-full max-w-xl">
      <h2 id="resume-heading" className="mb-2 font-display text-base tracking-tight">
        Fortsett der du slapp
      </h2>
      <div className="flex flex-col gap-2">
        {saved.length > 0
          ? saved.map(({ saved: search, unread }) => (
              <SavedSearchRow
                key={search.id}
                saved={search}
                unread={unread}
                onPick={onPickSavedSearch}
              />
            ))
          : lastSearch && (
              <button
                type="button"
                onClick={() => navigate({ to: "/annonser", search: lastSearch.search })}
                className={searchStartRowClass}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                  <History className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  Tilbake til {lastSearch.label}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            )}
      </div>
    </section>
  );
}
