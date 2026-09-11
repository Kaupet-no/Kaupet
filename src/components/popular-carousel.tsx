import { Link } from "@tanstack/react-router";
import Autoplay from "embla-carousel-autoplay";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard, type ListingCardData } from "@/components/listing-card";

// Defined at module scope (not inside WebLanding's render body) so it keeps
// a stable component identity across re-renders — e.g. while the hero's
// typewriter placeholder updates state every ~40-90ms. A component defined
// inline inside another component's render is a *new* function on every
// render, which makes React unmount and remount the whole subtree (every
// <img> included) instead of just re-rendering it, causing visible flicker.
export type PopularCarouselProps = {
  popular: ListingCardData[] | undefined;
  isError: boolean;
  onRetry: () => void;
  /** Vis "Nye annonser" i stedet for "Populært akkurat nå" når ingen av
   * annonsene faktisk har reelle visninger ennå (tidlig fase / lavt volum) —
   * se usePopularListings. */
  hasPopularitySignal: boolean;
};

export function PopularCarousel({
  popular,
  isError,
  onRetry,
  hasPopularitySignal,
}: PopularCarouselProps) {
  const autoplay = useMemo(() => Autoplay({ delay: 4500, stopOnInteraction: true }), []);
  const isLoading = popular === undefined;

  // Nothing to show yet (e.g. no traffic in the first week after launch) —
  // hide the whole section rather than show a skeleton that never resolves.
  if (!isLoading && !isError && popular.length === 0) return null;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl tracking-tight">
          {hasPopularitySignal ? "Populært akkurat nå" : "Nye annonser"}
        </h2>
        <Link
          to="/annonser"
          search={{ q: "", category: "", sort: "new" }}
          className="text-sm text-primary hover:underline"
        >
          Se alle →
        </Link>
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Klarte ikke å hente populære annonser akkurat nå.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Prøv igjen
          </Button>
        </div>
      ) : !isLoading && popular.length > 0 ? (
        <Carousel opts={{ align: "start", loop: true }} plugins={[autoplay]} className="w-full">
          <CarouselContent>
            {popular.map((listing) => (
              <CarouselItem
                key={listing.id}
                className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5"
              >
                <ListingCard listing={listing} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-3" />
          <CarouselNext className="-right-3" />
        </Carousel>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border p-3">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
