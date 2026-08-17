import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import type { ListingCardData } from "@/components/listing-card";
import { FavoriteButton } from "@/components/favorite-button";
import { formatPrice, displayPriceNok } from "@/lib/format";
import { useListingGalleryImages } from "@/hooks/use-listing-gallery-images";

type Props = {
  listing: ListingCardData;
  linkState?: Record<string, unknown>;
  coverImageUrl?: string | null;
  knownFavorite?: boolean;
  favoriteStateReady?: boolean;
};

/** Full-width "bilder" search-result variant — the listing's image gallery
 * is the entire card, with title/price/location laid over the top as a
 * gradient-backed overlay so the text stays readable regardless of how
 * light or dark the photo is. */
export function ListingCardImages({
  listing,
  linkState,
  coverImageUrl,
  knownFavorite,
  favoriteStateReady,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const priceLabel = formatPrice({ price_nok: displayPriceNok(listing), is_free: listing.is_free });

  useEffect(() => {
    if (!rootRef.current) return;
    const el = rootRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { images, imgUrls, isLoading } = useListingGalleryImages(listing.id, inView);

  const overlay = (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 rounded-t-xl p-4 pb-10 text-white"
      style={{
        // Flere gradient-steg enn Tailwinds from/via/to (2 segmenter) gir en
        // finere alfa-rampe — en grov 2-stegs gradient over et stort, flatt
        // område viste synlig banding/stripete overgang på jevne bakgrunner.
        backgroundImage:
          "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.58) 15%, rgba(0,0,0,0.42) 30%, rgba(0,0,0,0.27) 45%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.06) 75%, rgba(0,0,0,0) 100%)",
      }}
    >
      <h3 className="line-clamp-2 text-base font-medium leading-snug drop-shadow-sm">
        {listing.title}
      </h3>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-display text-lg font-semibold drop-shadow-sm">{priceLabel}</p>
        {listing.city && (
          <p className="flex items-center gap-1 text-sm drop-shadow-sm">
            <MapPin className="size-3.5" /> {listing.city}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <article
      ref={rootRef}
      className="relative overflow-hidden rounded-xl border border-border bg-card"
    >
      <Link
        to="/$kaupetCode"
        params={{ kaupetCode: listing.kaupet_code }}
        state={linkState}
        onClick={(e) => {
          // Karusellpilene ligger visuelt oppå bildet og dermed inni denne
          // lenken — bare naviger når klikket ikke traff en pil.
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {images.length > 0 ? (
          <ImageGallery
            images={images}
            imgUrls={imgUrls}
            activeImage={activeImage}
            onSelect={setActiveImage}
            title={listing.title}
            showThumbnails={false}
            overlaySlot={overlay}
            fit="cover"
          />
        ) : (
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
            {coverImageUrl ? (
              <img src={coverImageUrl} alt={listing.title} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                {isLoading ? "Laster bilder…" : "Ingen bilder"}
              </div>
            )}
            {overlay}
          </div>
        )}
      </Link>
      <FavoriteButton
        listingId={listing.id}
        size="sm"
        className="absolute right-3 top-3 z-10"
        knownFavorite={knownFavorite}
        favoriteStateReady={favoriteStateReady}
      />
    </article>
  );
}
