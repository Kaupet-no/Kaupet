import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid, MapPin, Search as SearchIcon } from "lucide-react";

import { ListingCard } from "@/components/listing-card";
import { usePopularListings } from "@/features/landing/use-popular-listings";
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { AnimatedSearchPlaceholder } from "@/components/animated-search-placeholder";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import { useFormFactor } from "@/hooks/use-form-factor";
import { AppHeroLogo } from "@/components/app-hero-logo";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { saveSearchToHistory } from "@/features/listing-search/search-panel/search-history";
import { submitSearch } from "@/features/listing-search/submit-search";
import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { NewListingDialog } from "@/components/new-listing-dialog";
import { Button } from "@/components/ui/button";

export function AppLanding({
  adPickerOpen,
  onAdPickerOpenChange,
}: {
  adPickerOpen: boolean;
  onAdPickerOpenChange: (open: boolean) => void;
}) {
  const { openPanel, savedLocation } = useSearchPanel();
  const { popular, popularIsError, refetchPopular, hasPopularitySignal } = usePopularListings(10);
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
    const query = qDraft.trim();
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
  // faktisk er tom. Uten det skillet ble tom katalog vist som tre pulserende
  // skjelettkort som aldri gikk over — altså en lastetilstand uten slutt,
  // som er nøyaktig det en bruker møter rett etter lansering. Web gjør dette
  // riktig fra før, se PopularCarousel. Er det ingenting under folden,
  // skjules både seksjonen og chevronen som inviterer til å scrolle dit.
  // `popular` er også `undefined` når spørringen FEILER — en feil er ikke en
  // lastetilstand heller, og skal tilby et forsøk på nytt i stedet for å
  // pulsere i det uendelige.
  const isLoadingPopular = popular === undefined && !popularIsError;
  const hasListings = !!popular && popular.length > 0;
  const hasSectionBelow = isLoadingPopular || hasListings || popularIsError;

  // Telefon: heroen står klistret mens annonsene scroller opp over den, og
  // fader ut i takt med scrollen — helt borte i det annonsene når bunnen av
  // innholdet (logo, søk, piller). Opasiteten skrives rett på DOM-noden for å
  // slippe en React-render per scroll-event. Nettbrett har ingen
  // fullskjerm-hero, og beholder vanlig flyt.
  const heroRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const stickyHero = !isTablet && hasSectionBelow;
  useEffect(() => {
    const hero = heroRef.current;
    const content = heroContentRef.current;
    if (!stickyHero || !hero || !content) return;
    const update = () => {
      const fadeDistance = Math.max(
        1,
        hero.offsetHeight - (content.offsetTop + content.offsetHeight),
      );
      const opacity = Math.max(0, 1 - window.scrollY / fadeDistance);
      hero.style.opacity = String(opacity);
      // Usynlig hero skal heller ikke kunne fokuseres eller leses opp.
      hero.style.visibility = opacity === 0 ? "hidden" : "";
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      hero.style.opacity = "";
      hero.style.visibility = "";
    };
  }, [stickyHero]);

  const pillClass =
    "native-touch-target inline-flex max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition active:opacity-80";

  return (
    <div className="pb-3">
      {/* Hero er en egen first-screen-seksjon: logo, søk og piller sentreres
          vertikalt i ledig rom over bunnnavigasjonen, og "Populært
          nå"/"Nye annonser" starter under folden. Brukeren skal scrolle for
          å se annonser — det er en bevisst prioritering av søk foran
          annonsekarusellen på forsiden. */}
      <section
        ref={heroRef}
        className={`flex flex-col items-center justify-center px-5 pb-4 pt-safe density-task ${
          isTablet ? "max-w-xl mx-auto" : "min-h-[calc(100dvh-var(--app-bottom-nav-h))]"
        } ${stickyHero ? "sticky top-0" : ""}`}
      >
        <div ref={heroContentRef} className="flex w-full flex-col items-center gap-3">
          <AppHeroLogo />
          <h1 className="text-center font-display text-xl tracking-tight">
            Hva leter du etter i dag?
          </h1>
          <form
            role="search"
            onSubmit={handleSearchSubmit}
            className="relative flex h-14 w-full max-w-xl items-center rounded-full border border-border bg-card px-4 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          >
            <SearchIcon className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                enterKeyHint="search"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                aria-label="Søk i annonser"
                className="w-full bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {!qDraft && (
                <span className="pointer-events-none absolute inset-0 flex items-center">
                  <AnimatedSearchPlaceholder
                    words={searchExamples}
                    paused={false}
                    className="text-base text-muted-foreground"
                  />
                </span>
              )}
            </div>
          </form>

          {/* Lokasjon og kategorier veier likt — begge er inngangsvalg til
            samme søkepanel, ikke en primær og en sekundær handling. Kaupet-
            kode er en sjelden, gjenkjennende handling (ikke oppdagende) og
            skal derfor ikke konkurrere visuelt med disse to. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => openPanel("location")}
              aria-label={`Velg lokasjon: ${locationLabel}`}
              className={`${pillClass} ${
                hasLocation
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{locationLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => openPanel("categories")}
              aria-label="Alle kategorier"
              className={`${pillClass} border-border bg-card text-muted-foreground`}
            >
              <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Alle kategorier</span>
            </button>
          </div>

          <KaupetCodeDialog
            trigger={
              <button
                type="button"
                className="native-touch-target text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Har du en Kaupet-kode?
              </button>
            }
          />
        </div>

        {stickyHero && (
          <ChevronDown
            className="mt-1 size-5 animate-bounce text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </section>

      {hasSectionBelow && (
        <section
          className={`relative z-10 bg-background px-5 ${isTablet ? "mt-2" : "pt-4"}`}
          aria-labelledby="popular-heading"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 id="popular-heading" className="font-display text-lg tracking-tight">
              {hasPopularitySignal ? "Populært nå" : "Nye annonser"}
            </h2>
            <button
              type="button"
              onClick={() => openPanel("query")}
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
              {/* På telefon lander knappens midtpunkt midt i nederste
                  tredjedel av synlig flate når siden er scrollet til bunns:
                  avstanden under midtpunktet er 1/6 av (skjerm − bunnnav),
                  minus halve knapphøyden (h-12 = 3rem) og
                  ytre pb-3. Fungerer fordi
                  fullskjerm-heroen alltid gjør siden høyere enn skjermen. */}
              <div
                className={`flex justify-center pt-6 ${
                  isTablet ? "" : "pb-[calc((100dvh_-_var(--app-bottom-nav-h))/6_-_2.25rem)]"
                }`}
              >
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

      <NewListingDialog open={adPickerOpen} onOpenChange={onAdPickerOpenChange} />
    </div>
  );
}
