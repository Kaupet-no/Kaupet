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
import { useScrollPinnedOffset } from "@/hooks/use-scroll-pinned-offset";
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
import { HERO_FADE_FALLBACK_PX, heroFadeDistances } from "@/components/hero-fade-distances";

/** Populære annonser hentes først når brukeren har scrollet så langt —
 * forsiden skal være rolig ved appstart, ikke laste annonser med en gang. */
const POPULAR_LOAD_AFTER_SCROLL_PX = 100;
/** Så lenge etter siste swipe i heroens kategorivelger holdes den fullt
 * synlig; deretter går den tilbake til scroll-avhengig fade. */
const CATEGORY_RAIL_SWIPE_MS = 3000;
/** Logoens scroll-hastighet i andel av sidens, etter at den slipper festet
 * (parallaks). Når innholdet nærmer seg, holder logoen følge med innholdet
 * i stedet — se use-scroll-pinned-offset.ts. */
const LOGO_SCROLL_RATE = 0.5;
/** Minst så langt over innholdets topp ligger logoen når innholdet
 * scroller forbi — den skal aldri komme borti under eller dekkes av det. */
const LOGO_RIDE_CLEARANCE_PX = 24;

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

  // Swiping i heroens kategorivelger viser den fullt igjen uansett hvor
  // langt siden er scrollet; 3 s etter siste sveip går den tilbake til den
  // scroll-avhengige faden. Aktiviteten styres av pekeren (ned/oppe) og
  // ikke av radens scroll-eventer — momentum ellers holder velgeren oppe
  // lenge etter at fingeren er løftet, og da kan søkefeltet tone ut mens
  // kategorivelgeren fortsatt står fullt synlig: snudd rekkefølge.
  const [railActive, setRailActive] = useState(false);
  const railIdleTimer = useRef<number | undefined>(undefined);
  const railPointerDown = useRef(false);
  const scheduleRailIdle = () => {
    window.clearTimeout(railIdleTimer.current);
    railIdleTimer.current = window.setTimeout(() => setRailActive(false), CATEGORY_RAIL_SWIPE_MS);
  };
  const handleRailPointerDown = () => {
    railPointerDown.current = true;
    window.clearTimeout(railIdleTimer.current);
    setRailActive(true);
  };
  const handleRailPointerEnd = () => {
    if (!railPointerDown.current) return;
    railPointerDown.current = false;
    scheduleRailIdle();
  };
  useEffect(() => () => window.clearTimeout(railIdleTimer.current), []);
  // Vertikal sidescroll er ny aktivitet et annet sted: velgeren går da med
  // en gang tilbake til scroll-faden, slik at den (som tiltenkt) tones ut
  // fortest og søkefeltet aldri forsvinner før kategorivelgeren.
  useEffect(() => {
    const onPageScroll = () => {
      if (railPointerDown.current) return;
      window.clearTimeout(railIdleTimer.current);
      setRailActive(false);
    };
    window.addEventListener("scroll", onPageScroll, { passive: true });
    return () => window.removeEventListener("scroll", onPageScroll);
  }, []);

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

  // Heroen (logo, søk og kategorivelger) står i ro i første skjermbilde
  // mens resten av siden scroller opp bak. Søk og kategorivelger ligger på
  // ulik høyde, så innholdet kommer over dem til ulik tid: fade-lengden
  // måles per del, fra delens bunn til innholdets start minus en margin,
  // med et minimum per del (se hero-fade-distances.ts) slik at faden ikke
  // blir altfor kort på lave skjermer. Kategorivelgeren (nederst) tones ut
  // fortest, deretter søkefeltet. Logoen tones ikke ut — den fester til
  const logoRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const popularSectionRef = useRef<HTMLElement>(null);
  const [heroLayout, setHeroLayout] = useState(() => ({
    searchFadeDistance: HERO_FADE_FALLBACK_PX,
    railFadeDistance: HERO_FADE_FALLBACK_PX,
    // Scroll-avstanden der logoen slipper grepet, forskjøvingen som bringer
    // den helt ut av viewporten, og klemmen som hindrer innholdet i å ta den
    // igjen. Fallback til første måling.
    logoPinUntil: typeof window === "undefined" ? 0 : window.innerHeight / 2,
    logoExitOffset: typeof window === "undefined" ? 0 : -window.innerHeight,
    logoClampBase: Number.POSITIVE_INFINITY,
  }));
  // Logoen fester (offset 0) frem til «Populært nå»-seksjonen er ca midt på
  // skjermen; deretter scroller den oppover i lavere tempo enn siden
  // (parallaks) — men når innholdet nærmer seg, holder den følge i stedet,
  // slik at innholdet alltid scroller forbi under den. Ved scroll i motsatt
  // retning går den tilbake til hjem-posisjonen og blir værende der.
  const logoOffset = useScrollPinnedOffset(
    heroLayout.logoPinUntil,
    LOGO_SCROLL_RATE,
    heroLayout.logoClampBase,
  );
  const logoOffsetRef = useRef(0);
  useEffect(() => {
    logoOffsetRef.current = logoOffset;
  }, [logoOffset]);
  useLayoutEffect(() => {
    const measure = () => {
      const logo = logoRef.current;
      const search = searchRef.current;
      const rail = railRef.current;
      const content = contentRef.current;
      // «Populært nå»-seksjonen er målet for festingen; innholdet er
      // fallback hvis den ikke er rendret.
      const pinTarget = popularSectionRef.current ?? contentRef.current;
      if (!logo || !search || !rail || !content || !pinTarget) return;
      const fades = heroFadeDistances(
        {
          search: search.getBoundingClientRect().bottom,
          rail: rail.getBoundingClientRect().bottom,
        },
        content.getBoundingClientRect().top,
      );
      const logoRect = logo.getBoundingClientRect();
      setHeroLayout({
        searchFadeDistance: fades.search,
        railFadeDistance: fades.rail,
        // Logoen fester til målseksjonens topp (i dokumentet) er ca midt
        // på skjermen.
        logoPinUntil:
          pinTarget.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2,
        // Fast posisjon: logoen er ute av syne når den er forskjøvet like
        // langt opp som veien fra viewportens topp pluss egen høyde. Rectet
        // inneholder offseten fra forrige render (resize midt i scrollen),
        // så den trekkes fra for å få hjem-posisjonen.
        logoExitOffset: -(logoRect.top - logoOffsetRef.current + logoRect.height),
        // Klemmen: logoens bunn holdes minst LOGO_RIDE_CLEARANCE_PX over
        // innholdets topp (i dokumentet), uansett hvor langt det scroller.
        logoClampBase:
          content.getBoundingClientRect().top +
          window.scrollY -
          LOGO_RIDE_CLEARANCE_PX -
          (logoRect.bottom - logoOffsetRef.current),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // Ulikt fade-tempo: delen med kortest vei til kontakt tones ut fortest.
  const searchFade = useScrollFadeOpacity(heroLayout.searchFadeDistance);
  const railFade = useScrollFadeOpacity(heroLayout.railFadeDistance);
  // Søkefeltet skal aldri tones ut mens det brukes; swiping holder
  // kategorivelgeren fullt synlig.
  const searchOpacity = searchActive ? 1 : searchFade;
  const railOpacity = railActive ? 1 : railFade;
  const searchGone = searchOpacity < 0.05;
  const railGone = railOpacity < 0.05;
  const logoOffscreen = logoOffset < heroLayout.logoExitOffset;
  // Hele heroen er bare inert/skjult når alle delene er borte — en aktiv
  // kategorivelger, et søkefelt i fokus eller en synlig logo skal forbli
  // operabelig/synlig.
  const heroHidden = searchGone && railGone && logoOffscreen;
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
  const locationName = hasLocation ? savedLocation.label || "Valgt sted" : "Hele Norge";
  const locationLabel = hasLocation ? `${locationName} · ${savedLocation.radius} km` : "Hele Norge";

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
      {/* Første skjermbilde eies av logo, søkefelt og kategorivelger, midt på
          siden (UI-guiden § Visuell rytme), flyttet litt opp. Heroen er festet
          til viewporten mens resten av siden scroller opp bak den. Søk og
          kategorivelger tones ut med hver sin målte fade-lengde — velgeren
          forsvinner først, deretter søkefeltet. Logoen tones ikke ut: den
          fester til «Populært nå» er ca midt på skjermen, scroller deretter
          saktere enn siden (parallaks) og holder følge med innholdet idet
          det nærmer seg, slik at innholdet alltid scroller forbi under den. */}
      {/* Mens søkeforslagene er åpne, ligger heroen over innholdet (men
          under bunnnaven): forslagsvinduet uttones ikke med feltet og må
          aldri dekkes av annonsekort som har scrollet opp ved siden av. */}
      <div
        data-testid="home-hero"
        aria-hidden={heroHidden || undefined}
        inert={heroHidden || undefined}
        className={`pointer-events-none fixed inset-0 flex -translate-y-4 items-center justify-center px-5 pt-safe pb-bottom-nav ${
          searchFocused ? "z-20" : "z-0"
        }`}
      >
        <div className={`flex w-full flex-col items-center gap-3 ${isTablet ? "max-w-xl" : ""}`}>
          <div
            data-testid="home-hero-logo"
            ref={logoRef}
            style={{ transform: `translateY(${logoOffset}px)` }}
          >
            <AppHeroLogo />
            <h1 className="sr-only">Hva leter du etter i dag?</h1>
          </div>
          <form
            data-testid="home-hero-search"
            ref={searchRef}
            role="search"
            onSubmit={handleSearchSubmit}
            className="relative flex h-14 w-full max-w-xl items-center rounded-full border border-border bg-card px-4 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
            // Helt uttonet søkefelt er ikke aktivt: verken pekere eller
            // tastaturfokus når det er usynlig.
            aria-hidden={searchGone || undefined}
            inert={searchGone || undefined}
            style={{
              opacity: searchOpacity,
              transition: "opacity 150ms ease",
              pointerEvents: searchGone ? "none" : "auto",
            }}
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
          {/* Kategorivelgeren under søkefeltet, med ekstra luft over. Den
              toner ut fortest (nærmest innholdet), men swiping holder den
              fullt synlig — derfor egen opacity og egne pekere, slått av når
              den er uttonet. */}
          <div
            data-testid="home-category-rail"
            ref={railRef}
            className="mt-3 w-full"
            style={{
              opacity: railOpacity,
              transition: "opacity 150ms ease",
              pointerEvents: railGone ? "none" : "auto",
            }}
            onPointerDown={handleRailPointerDown}
            onPointerUp={handleRailPointerEnd}
            onPointerCancel={handleRailPointerEnd}
            onPointerLeave={handleRailPointerEnd}
          >
            <CategoryRail
              locationName={locationName}
              locationLabel={locationLabel}
              hasLocation={hasLocation}
              onOpenLocation={() => openPanel("location")}
              categories={mainCategories}
              onPickCategory={goToCategory}
            />
          </div>
        </div>
      </div>

      {/* Reserverer hele første skjermbilde til heroen. */}
      <div aria-hidden="true" className="h-dvh" />

      {/* Innholdet scroller opp over heroen; uigjennomsiktig bakgrunn og
          høyere z-index holder det alltid over den uttonede heroen. */}
      <div ref={contentRef} className="density-task relative z-10 bg-background px-5 pb-3 pt-6">
        {hasSectionBelow && (
          <section
            ref={popularSectionRef}
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

/** Kategorivelgeren: lokasjon først, deretter hovedkategoriene, som en
 * vannrett rullerad i heroen under søkefeltet, med scroll-avhengig fade og
 * swipe-hold (se AppLanding) — begge valgene går rett til resultater med
 * kategorien valgt. */
function CategoryRail({
  locationName,
  locationLabel,
  hasLocation,
  onOpenLocation,
  categories,
  onPickCategory,
}: {
  locationName: string;
  locationLabel: string;
  hasLocation: boolean;
  onOpenLocation: () => void;
  categories: Category[];
  onPickCategory: (category: Category) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Kategorier"
      className="-mx-5 flex w-[calc(100%+2.5rem)] gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={onOpenLocation}
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
        <span className="line-clamp-2 text-xs leading-tight">{locationName}</span>
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onPickCategory(category)}
          className="native-touch-target flex w-16 shrink-0 flex-col items-center gap-2 text-center"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-primary">
            <CategoryIcon iconName={category.icon} className="size-6" aria-hidden="true" />
          </span>
          <span className="line-clamp-2 text-xs leading-tight">{category.name_nb}</span>
        </button>
      ))}
    </div>
  );
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
