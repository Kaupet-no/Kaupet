import { Link } from "@tanstack/react-router";
import { Eye, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { VehicleInfoGrid } from "@/components/listing-detail/vehicle/vehicle-info-grid";
import { BoatInfoGrid, isBoatAttributes } from "@/components/listing-detail/boat/boat-info-grid";
import { displayPriceNok, UsageLabel, type ListingCardData } from "@/components/listing-card";
import { FavoriteButton } from "@/components/favorite-button";
import { formatPrice } from "@/lib/format";
import { useListingGalleryImages } from "@/hooks/use-listing-gallery-images";
import { VEHICLE_LEAF_SLUGS, type VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";

type Props = {
  listing: ListingCardData;
  linkState?: Record<string, unknown>;
  coverImageUrl?: string | null;
  knownFavorite?: boolean;
  favoriteStateReady?: boolean;
};

/** Full-width "kort" search-result variant — a preview of the listing with
 * its complete image gallery (lazy-loaded once scrolled into view; excludes
 * 360°, since `ImageGallery` only renders that when a `vehicle360` prop is
 * passed and we don't fetch/pass one here). */
export function ListingCardExpanded({
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

  const attributes = listing.attributes ?? {};
  // Samme utledning som listing-detail-view.tsx — kort-visningen skal vise de
  // samme nøkkeltallene som detaljsiden, ikke en egen forkortet liste.
  const isVehicleListing =
    !!listing.category_slug &&
    VEHICLE_LEAF_SLUGS.includes(listing.category_slug as VehicleLeafSlug);
  const vehicleLookup = isVehicleListing
    ? (parseVehicleLookup(attributes.vehicle_lookup) ?? null)
    : null;
  const euControlExempt = isVehicleListing && attributes.eu_control_exempt === true;
  const driveTypeRaw = attributes.drive_type;
  const driveType =
    isVehicleListing && typeof driveTypeRaw === "string"
      ? driveTypeRaw
      : (vehicleLookup?.drive_type ?? null);
  const isBoatListing = !isVehicleListing && isBoatAttributes(attributes);

  return (
    <article
      ref={rootRef}
      className="relative overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="p-4 pb-0">
        <Link
          to="/$kaupetCode"
          params={{ kaupetCode: listing.kaupet_code }}
          state={linkState}
          className="block pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <h3 className="text-lg font-medium leading-snug">{listing.title}</h3>
          {listing.subtitle && <p className="text-sm text-muted-foreground">{listing.subtitle}</p>}
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="font-display text-xl font-semibold">{priceLabel}</p>
            {typeof listing.mileage_km === "number" ? (
              <UsageLabel value={listing.mileage_km} unit="km" />
            ) : typeof listing.engine_hours === "number" ? (
              <UsageLabel value={listing.engine_hours} unit="t" />
            ) : null}
          </div>
          {listing.city && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> {listing.city}
            </p>
          )}
        </Link>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div onClick={(e) => e.stopPropagation()}>
          {images.length > 0 ? (
            <ImageGallery
              images={images}
              imgUrls={imgUrls}
              activeImage={activeImage}
              onSelect={setActiveImage}
              title={listing.title}
              showThumbnails={false}
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
            </div>
          )}
        </div>

        <Link
          to="/$kaupetCode"
          params={{ kaupetCode: listing.kaupet_code }}
          state={linkState}
          className="flex flex-col gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {(isVehicleListing || isBoatListing) && (
            <div className="-mt-6">
              {isVehicleListing && (
                <VehicleInfoGrid
                  vehicleLookup={vehicleLookup}
                  mileageKm={typeof listing.mileage_km === "number" ? listing.mileage_km : null}
                  euControlExempt={euControlExempt}
                  driveType={driveType}
                />
              )}
              {isBoatListing && <BoatInfoGrid attributes={attributes} />}
            </div>
          )}
          {typeof listing.total_views === "number" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="size-3" />
              <span>{listing.total_views.toLocaleString("nb-NO")}</span>
              <span className="text-muted-foreground/70">
                · {(listing.views_last_week ?? 0).toLocaleString("nb-NO")} siste syv dager
              </span>
            </p>
          )}
        </Link>
      </div>
      <FavoriteButton
        listingId={listing.id}
        size="sm"
        className="absolute right-6 top-6"
        knownFavorite={knownFavorite}
        favoriteStateReady={favoriteStateReady}
      />
    </article>
  );
}
