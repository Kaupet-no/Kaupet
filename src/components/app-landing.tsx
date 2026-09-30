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
import { criteriaToValue } from "@/lib/advanced-search-value";
import { CategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/lib/categories";
import { readLastSearchContext } from "@/lib/last-search-context";
import {
  forceShortenedTileLabels,
  norwegianHyphenationSupported,
  shortenTileLabel,
} from "@/lib/hyphenation";
import type { SavedSearch } from "@/lib/saved-searches";
import { SavedSearchRow } from "@/features/listing-search/search-start";
import {
  searchStartRowClass,
  useSavedSearchesWithUnread,
} from "@/features/listing-search/use-saved-searches-with-unread";
import { submitSearch } from "@/features/listing-search/submit-search";
import { defaultAdvancedSearchValue } from "@/lib/advanced-search-value";
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
 * (parallaks). Farten holdes hele veien — innholdet nedenfra tar logoen
 * igjen og glir opp over den, mens den toner ut i takt med dekningen
 * (se use-scroll-pinned-offset.ts). */
const LOGO_SCROLL_RATE = 0.5;
/** Avstanden (px) mellom logoens bunn og innholdets topp der logoen begynner
 * å tone ut — like før innholdet når den. Faden står i forhold til dekning:
 * helt uttonet idet innholdet har dekket hele logoen (målt per skjerm). */
const LOGO_FADE_START_PX = 32;

/** Luft mellom bunnen av skjermen og den nederstlåste «Fortsett der du
 * slapp»-seksjonen på nettbrett (bottom-3 + litt ekstra). */
const RESUME_PIN_MARGIN_PX = 24;
/** Hysterese: så mye ekstra rom kreves for at seksjonen skal gå TILBAKE
 * til den nederstlåste plasseringen etter å ha flyttet ned i flyten.
 * Uden denne kunne de to plasseringene (som måler litt ulikt) veksle
 * frem og tilbake i det uendelige — et uendelig re-render-løp som får
 * React til å krasje («Maximum update depth exceeded»). */
const RESUME_PIN_RETURN_SLACK_PX = 32;

export function AppLanding({
  adPickerOpen,
  onAdPickerOpenChange,
}: {
  adPickerOpen: boolean;
  onAdPickerOpenChange: (open: boolean) => void;
}) {
  const { openPanel, savedLocation } = useSearchPanel();
  // Telefon og nettbrett forgrener seg her: telefonen har fastlåst hero
  // med fade ved scroll (se nedenfor), nettbrettet har samme hero-plassering
  // i vanlig flyt — med «Fortsett der du slapp» låst til bunnen av
  // hero-blokken og innholdet under (se JSX; ved plasskonflikt med
  // kodeknappen flyttes seksjonen ned i flyten og krever scroll).
  const isTablet = useFormFactor() === "tablet";
  const [searchFocused, setSearchFocused] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  // Søkefeltet skal aldri tones ut mens brukeren faktisk bruker det: fokus og
  // åpent tastatur holder heroen fullt synlig uansett scroll.
  const searchActive = searchFocused || keyboardVisible;
  const searchInputRef = useRef<HTMLInputElement>(null);
  // På native kan tastaturet lukkes uten at feltet mister DOM-fokus — med
  // Androids tilbake-tast eller iOS sin scroll-avvisning blir fokus sittende
  // i feltet, og heroen står dermed stille «aktiv» med åpent forslagslag.
  // Web har aldri tastaturhendelser (useKeyboardVisible er der alltid false,
  // så effekten ikke kjører på nytt), og tap utenfor feltet blur-er uansett.
  useEffect(() => {
    if (keyboardVisible) return;
    const input = searchInputRef.current;
    if (input && document.activeElement === input) input.blur();
  }, [keyboardVisible]);

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
  // — ikke straks appen åpner. På nettbrett ligger innholdet rett under
  // heroen og scrolles straks til, så der hentes de med en gang.
  // `window.scrollY` ved init dekker iOS sin gjenopprettede scrollposisjon når
  // brukeren kommer tilbake til forsiden.
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
    isTablet || userScrolled,
  );

  // Heroen (logo, søk og kategorivelger) står i ro i første skjermbilde
  // mens resten av siden scroller opp bak. Søk og kategorivelger ligger på
  // ulik høyde, så innholdet kommer over dem til ulik tid: fade-lengden
  // måles per del, fra delens bunn til innholdets start minus en margin,
  // med et minimum per del (se hero-fade-distances.ts) slik at faden ikke
  // blir altfor kort på lave skjermer. Delene tones ut i takt med veien til
  // innholdet: Kaupet-kode-knappen (nederst) fortest, deretter
  // kategorivelgeren, deretter søkefeltet. Logoen fester lengst og toner
  // først ut idet innholdet kommer opp over den (se
  // use-scroll-pinned-offset.ts).
  const logoRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const resumeSectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [heroLayout, setHeroLayout] = useState(() => ({
    searchFadeDistance: HERO_FADE_FALLBACK_PX,
    railFadeDistance: HERO_FADE_FALLBACK_PX,
    codeFadeDistance: HERO_FADE_FALLBACK_PX,
    // Scroll-avstanden der logoen slipper grepet, og fasetrekket som toner
    // den ut idet innholdet glir opp over den. Fallback til første måling.
    logoPinUntil: typeof window === "undefined" ? 0 : window.innerHeight / 2,
    logoFade: {
      gap0: typeof window === "undefined" ? 0 : window.innerHeight / 2,
      startGapPx: LOGO_FADE_START_PX,
      endGapPx: -HERO_FADE_FALLBACK_PX,
    },
  }));
  // Logoen fester (offset 0) frem til den første innholdsseksjonen er ca
  // midt på skjermen; deretter scroller den oppover i lavere tempo enn siden
  // (parallaks), hele veien. Innholdet nedenfra tar den igjen og glir opp
  // over den — logoen toner ut i takt med dekningen, slik at den oppfattes
  // som å forsvinne bak innholdet. Ved scroll i motsatt retning går den
  // tilbake til hjem-posisjonen og blir værende der. Nettbrettet har ingen
  // fastlåst hero og bruker ingen av disse verdiene (hooken er da avslått).
  const { offset: logoOffset, opacity: logoOpacity } = useScrollPinnedOffset(
    heroLayout.logoPinUntil,
    LOGO_SCROLL_RATE,
    heroLayout.logoFade,
    !isTablet,
  );
  const logoOffsetRef = useRef(0);
  useEffect(() => {
    logoOffsetRef.current = logoOffset;
  }, [logoOffset]);
  useLayoutEffect(() => {
    // Fastlåst hero med fade-måling finnes bare på telefon.
    if (isTablet) return;
    const measure = () => {
      const logo = logoRef.current;
      const search = searchRef.current;
      const rail = railRef.current;
      const code = codeRef.current;
      const content = contentRef.current;
      // Den første innholdsseksjonen («Fortsett der du slapp», som vises
      // først) er målet for festingen; innholdet er fallback hvis den ikke
      // er rendret.
      const pinTarget = resumeSectionRef.current ?? contentRef.current;
      if (!logo || !search || !rail || !code || !content || !pinTarget) return;
      // Innholdets topp i dokumentkoordinater: hero-delene er fastlåste, så
      // deres viewportposisjon ER dokumentposisjon — men innholdet flytter
      // seg med scrollen. Uten + scrollY ville en resize (eller iOS sin
      // gjenopprettede scrollposisjon ved innlasting) gi for korte
      // fade-avstander, slik at delene tones ut for tidlig.
      const contentTopDoc = content.getBoundingClientRect().top + window.scrollY;
      const fades = heroFadeDistances(
        {
          search: search.getBoundingClientRect().bottom,
          rail: rail.getBoundingClientRect().bottom,
          code: code.getBoundingClientRect().bottom,
        },
        contentTopDoc,
      );
      const logoRect = logo.getBoundingClientRect();
      setHeroLayout({
        searchFadeDistance: fades.search,
        railFadeDistance: fades.rail,
        codeFadeDistance: fades.code,
        // Logoen fester til målseksjonens topp (i dokumentet) er ca midt
        // på skjermen.
        logoPinUntil:
          pinTarget.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2,
        // Fasetrekket: gap0 er avstanden fra logoens hjemme-bunn (heroen er
        // fast, og rectet inneholder offseten fra forrige render, så den
        // trekkes fra) til innholdets topp i dokumentet. Faden starter
        // LOGO_FADE_START_PX før innholdet tar logoen og er fullført når
        // hele logoens høyde er dekket.
        logoFade: {
          gap0: contentTopDoc - (logoRect.bottom - logoOffsetRef.current),
          startGapPx: LOGO_FADE_START_PX,
          endGapPx: -logoRect.height,
        },
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isTablet]);
  // Nettbrett: «Fortsett der du slapp» står normalt låst nederst i heroen,
  // synlig uten å scrolle. Blir rommet for trangt (liggende nettbrett,
  // mange lagrede søk) og seksjonen ville kollidere med
  // Kaupet-kode-knappen, flyttes den i stedet ned i vanlig flyt under
  // heroen — brukeren må da scroller for å se den. Knappen måles i
  // dokumentkoordinater (+ scrollY), slik at målingen er riktig også når
  // brukeren har scrollet og viewporthøyden endres etterpå; ellers ville
  // en scrollet ut av syne knapp gi «godt med rom» uansett. Målingen
  // følger den monterte plasseringen (pin eller flyt — samme bredde, se
  // JSX, slik at høyden måles likt), ResizeObserver fanger opp at
  // sekvensen vokser når lagrede søk/historikk laster, og hysterese
  // (RETURN_SLACK) hindrer at de to plasseringene veksler i det uendelige.
  const [resumeConflicts, setResumeConflicts] = useState(false);
  useLayoutEffect(() => {
    if (!isTablet) return;
    const section = resumeSectionRef.current;
    const code = codeRef.current;
    if (!section || !code) return;
    const check = () => {
      const codeBottomDoc = code.getBoundingClientRect().bottom + window.scrollY;
      const available = window.innerHeight - codeBottomDoc - RESUME_PIN_MARGIN_PX;
      const needed = section.getBoundingClientRect().height;
      setResumeConflicts((previous) =>
        previous ? needed > available - RESUME_PIN_RETURN_SLACK_PX : needed > available,
      );
    };
    check();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    observer?.observe(section);
    window.addEventListener("resize", check);
    // iOS sin dynamiske viewport (URL-linje, tastatur) kan endre høyden
    // uten at window-resize fyres umiddelbart — visualViewport er den
    // pålitelige kilden der.
    window.visualViewport?.addEventListener("resize", check);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", check);
      window.visualViewport?.removeEventListener("resize", check);
    };
  }, [isTablet, resumeConflicts]);
  // Ulikt fade-tempo: delen med kortest vei til kontakt tones ut fortest —
  // Kaupet-kode-knappen (nederst), deretter kategorivelgeren, deretter
  // søkefeltet. Nettbrettet fader ikke ved scroll (hookene er da avslått).
  const searchFade = useScrollFadeOpacity(heroLayout.searchFadeDistance, !isTablet);
  const railFade = useScrollFadeOpacity(heroLayout.railFadeDistance, !isTablet);
  const codeFade = useScrollFadeOpacity(heroLayout.codeFadeDistance, !isTablet);
  // Søkefeltet skal aldri tones ut mens det brukes; swiping holder
  // kategorivelgeren fullt synlig.
  const searchOpacity = isTablet || searchActive ? 1 : searchFade;
  const railOpacity = isTablet || railActive ? 1 : railFade;
  const codeOpacity = isTablet ? 1 : codeFade;
  const searchGone = !isTablet && searchOpacity < 0.05;
  const railGone = !isTablet && railOpacity < 0.05;
  const codeGone = !isTablet && codeOpacity < 0.05;
  const logoGone = !isTablet && logoOpacity < 0.05;
  // Hele heroen er bare inert/skjult når alle delene er borte — en aktiv
  // kategorivelger, et søkefelt i fokus eller en synlig logo skal forbli
  // operabelig/synlig.
  const heroHidden = searchGone && railGone && codeGone && logoGone;
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
      {/* Telefon: første skjermbilde eies av logo, søkefelt og
          kategorivelger, midt på siden (UI-guiden § Visuell rytme), flyttet
          litt opp. Heroen er festet til viewporten mens resten av siden
          scroller opp bak den. Søk og kategorivelger tones ut med hver sin
          målte fade-lengde — velgeren forsvinner først, deretter
          søkefeltet. Logoen fester til første innholdsseksjon er ca midt
          på skjermen og scroller deretter saktere enn siden (parallaks) —
          innholdet tar den igjen og glir opp over den, mens logoen toner
          ut i takt med dekningen og oppfattes som forsvinner bak
          innholdet.

          Nettbrett: heroen er plassert nøyaktig likt som på telefon —
          logo, søk og kategorivelger midt på første skjermbilde, med
          samme løfte — men blokken står i vanlig flyt i stedet for å
          være festet til viewporten. «Fortsett der du slapp» ligger låst
          til bunnen av blokkens tomrom under de sentrerte elementene,
          synlig nederst på skjermen uten å scrolle. */}
      {/* Telefon: heroen ligger over innholdet (men under bunnnaven) —
          søkeforslagsvinduet uttones ikke med feltet og må aldri dekkes av
          annonsekort som har scrollet opp ved siden av, og logoen fader ut
          foran innholdets bakgrunn i stedet for å bli kuttet av den. */}
      <div
        data-testid="home-hero"
        aria-hidden={heroHidden || undefined}
        inert={heroHidden || undefined}
        className={
          isTablet
            ? // Likt telefonens hero-plassering: midt på første skjermbilde
              // med samme løfte — men i vanlig flyt, ikke festet.
              // `relative` gjør blokken festepunkt for den nederstlåste
              // «Fortsett der du slapp»-delen under.
              "relative flex min-h-dvh -translate-y-4 items-center justify-center px-5 pt-safe"
            : // Heroen ligger alltid over innholdet (z-20, under bunnnavens
              // z-50): logoen fader ut foran innholdets bakgrunn i
              // stedet for å bli kuttet av den. Søk og kategorivelger er
              // uttonet og pekerdøde lenge før innholdet rekker dem, og
              // hero-beholderen er i seg selv pekerdød.
              "pointer-events-none fixed inset-0 z-20 flex -translate-y-4 items-center justify-center px-5 pt-safe pb-bottom-nav"
        }
      >
        {/* Kolonnen er fullbredde: kategorivelgeren skal gå kant til kant på
            nettbrett, og hver smalere del (søkefelt, logo, kodeknapp) holder
            seg sentrert av egen kraft — søkefeltet via max-w-xl, knappen via
            mx-auto. På telefon er kolonnen som før. */}
        <div className="flex w-full flex-col items-center gap-3">
          <div
            data-testid="home-hero-logo"
            ref={logoRef}
            // Nettbrettet scroller som vanlig: ingen parallaks-forskjøving og
            // ingen fade for logoen der.
            style={
              isTablet
                ? undefined
                : {
                    transform: `translateY(${logoOffset}px)`,
                    opacity: logoOpacity,
                    transition: "opacity 150ms ease",
                  }
            }
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
                ref={searchInputRef}
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
              toner ut med målt fade-lengde, men swiping holder den fullt
              synlig — derfor egen opacity og egne pekere, slått av når den
              er uttonet. */}
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
          {/* Kaupet-kode-knappen er en egen hero-del, ikke del av
              kategorivelgeren. Den ligger nederst på siden og har dermed
              kortest vei til innholdet — den toner ut fortest av alle
              delene. På telefon arver den heroens faste posisjon; på
              nettbrett står den i vanlig flyt. */}
          <div
            data-testid="home-kaupet-code"
            ref={codeRef}
            className="mt-8 w-full"
            style={{
              opacity: codeOpacity,
              transition: "opacity 150ms ease",
              pointerEvents: codeGone ? "none" : "auto",
            }}
          >
            {/* Likt «Vis alle annonser»: ekte knapp i samme stil, vannrett
                sentrert. */}
            <KaupetCodeDialog
              trigger={
                <Button variant="outline" className="mx-auto flex h-12 rounded-full px-6">
                  Har du en Kaupet-kode?
                </Button>
              }
            />
          </div>

          {/* Nettbrett: «Fortsett der du slapp» låses normalt til bunnen
              av heroens tomrom under de sentrerte elementene — synlig
              nederst på skjermen uten å scrolle, mens heroen selv beholder
              mobilens nøyaktige plassering. Er rommet for trangt (målt i
              effekten over), flyttes seksjonen ned i vanlig flyt under
              heroen i stedet, og brukeren scroller for å se den. På
              telefon står seksjonen i innholdet under heroen i stedet (se
              contentRef-blokken). */}
          {isTablet && !resumeConflicts && (
            <div
              data-testid="home-resume-pin"
              ref={resumeSectionRef}
              className="absolute inset-x-5 bottom-3 z-10"
            >
              <div className="mx-auto max-w-xl">
                <ResumeSearch onPickSavedSearch={runSavedSearch} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Telefon: reserverer hele første skjermbilde til heroen. */}
      {!isTablet && <div aria-hidden="true" className="h-dvh" />}

      {/* Telefon: innholdet scroller opp over heroen; uigjennomsiktig
          bakgrunn og høyere z-index holder det alltid over den uttonede
          heroen. Nettbrett: vanlig flyt, med litt luft mellom
          Kaupet-kode-knappen og «Populært nå». */}
      <div
        ref={contentRef}
        className={
          isTablet
            ? "density-task px-5 pb-3 pt-4"
            : "density-task relative z-10 bg-background px-5 pb-3 pt-6"
        }
      >
        {/* Telefon: første innholdsseksjon — også målet for logoens festing
            (se measure()), med innholdet som fallback når den ikke
            rendrer. Nettbrett: seksjonen står normalt låst nederst i
            heroen (se home-resume-pin); bare når den ville kollidere med
            kodeknappen flyttes den hit, under heroen. `max-w-xl` på
            nettbrett gir samme bredde som pin-plasseringen, slik at
            konfliktmålingen blir lik i begge retninger. */}
        {(!isTablet || resumeConflicts) && (
          <div ref={resumeSectionRef} className={isTablet ? "mx-auto max-w-xl" : ""}>
            <ResumeSearch onPickSavedSearch={runSavedSearch} />
          </div>
        )}

        {hasSectionBelow && (
          <section
            className={`bg-background ${isTablet ? "mt-8" : "mt-6 pt-2"}`}
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
 * kategorien valgt. Flisene har fast bredde (w-16), og etikett-spennet må
 * låses til den bredden (w-full) — i `items-center`-kolonnen ville spennet
 * ellers fått innholdsbredde (like bredt som lengste ordet) og raget ut
 * over flisen og inn i naboen, uansett orddeling: det var selve
 * overlappingsfeilen. Innenfor flisbredden orddeles lange enkelord
 * («Underholdning», «Samleobjekter») over de to linjene når motoren
 * faktisk gjør det i fliskonteksten (hyphens-auto; html lang="nb") —
 * sonden i src/lib/hyphenation.ts måler akkurat det, med en replika av
 * flisen. Virker ikke orddelingen, kortes etikettene i stedet; uten
 * break-words blir et eventuelt likevel for langt ord klippet av klemmen
 * (overlappe kan det ikke lenger). */
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
  // Uten orddelingsordbok (eldre WebView-er, eller motorer der line-clamp-
  // klemmen blokkerer orddeling) kortes etikettene i stedet for at lange
  // enkelord skal brytes rått midt i ordet. `?kortetiketter` tvinger
  // korting på i dev-bygg for lokal verifisering.
  const hyphenationSupported = norwegianHyphenationSupported() && !forceShortenedTileLabels();
  const tileLabel = (label: string) => (hyphenationSupported ? label : shortenTileLabel(label));
  return (
    <div
      role="group"
      aria-label="Kategorier"
      // `category-rail-scroll` (styles.css) sentrerer raden når alle flisene
      // får plass, og holder venstrejustering (scrolles fra start) når den
      // flyter over — Tailwind v4 genererer ikke safe center selv.
      className="category-rail-scroll -mx-5 flex w-[calc(100%+2.5rem)] gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <span className="line-clamp-2 w-full hyphens-auto text-xs leading-tight">
          {tileLabel(locationName)}
        </span>
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
          <span className="line-clamp-2 w-full hyphens-auto text-xs leading-tight">
            {tileLabel(category.name_nb)}
          </span>
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
