import { LayoutGrid, MapPin, Search as SearchIcon } from "lucide-react";

import { ListingCard } from "@/components/listing-card";
import { usePopularListings } from "@/features/landing/use-popular-listings";
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { AnimatedSearchPlaceholder } from "@/components/animated-search-placeholder";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import { useFormFactor } from "@/hooks/use-form-factor";
import { AppHeroLogo } from "@/components/app-hero-logo";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";

export function AppLanding() {
  const { openPanel, savedLocation } = useSearchPanel();
  const { popular, hasPopularitySignal } = usePopularListings(10);
  const isTablet = useFormFactor() === "tablet";
  const searchExamples = useDefaultSearchExamples();
  const hasLocation = savedLocation.lat != null && savedLocation.lng != null;
  const locationLabel = hasLocation
    ? `${savedLocation.label || "Valgt sted"} · ${savedLocation.radius} km`
    : "Hele Norge";

  const pillClass =
    "native-touch-target inline-flex max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition active:opacity-80";

  return (
    <div className="pb-3">
      <AppHeroLogo />

      {/* Handel før merkevare: søk er første handling brukeren møter, og
          hero/luft over er bevisst redusert (fase B1) slik at minst ett
          troverdig annonsekort under er lesbart innen første skjermbilde
          ved standard tekststørrelse på en vanlig telefon. */}
      <section className="flex flex-col items-center gap-3 px-5 pb-4 pt-1 density-task">
        <h1 className="text-center font-display text-xl tracking-tight">
          Hva leter du etter i dag?
        </h1>
        <button
          type="button"
          onClick={() => openPanel("query")}
          aria-label="Åpne søk i annonser"
          className="relative flex h-14 w-full max-w-xl items-center rounded-full border border-border bg-card px-4 text-left text-base shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.99]"
        >
          <SearchIcon className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <AnimatedSearchPlaceholder
            words={searchExamples}
            paused={false}
            className="text-base text-muted-foreground"
          />
        </button>

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
      </section>

      <section className="mt-2 pl-5" aria-labelledby="popular-heading">
        <div className="mb-3 flex items-center justify-between pr-5">
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
        {popular && popular.length > 0 ? (
          isTablet ? (
            <div className="grid grid-cols-3 gap-4 pb-2 pr-5">
              {popular.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {popular.map((listing) => (
                <div key={listing.id} className="w-[60%] shrink-0 snap-start">
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex gap-3 overflow-hidden pr-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[4/3] w-[60%] shrink-0 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
