import { Link } from "@tanstack/react-router";
import { Gauge, ImageOff } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { signListingImageUrls, thumbPathFor } from "@/lib/storage";
import { displayPriceNok, formatNokNumber, formatPrice } from "@/lib/format";
import { useListingImageFallback } from "@/hooks/use-listing-image-fallback";
import { FavoriteButton } from "@/components/favorite-button";
import { Skeleton } from "@/components/ui/skeleton";
import { PART_FITMENT_SCOPE_KEY, PART_FITMENT_VEHICLE_IDS_KEY } from "@/lib/category-filters";
import type { ListingCardData } from "@/lib/listing-card-data";
function partFitmentLabel(attributes: Record<string, unknown> | null | undefined): string | null {
  const scope = attributes?.[PART_FITMENT_SCOPE_KEY];
  if (scope === "universal") return "Universal del";
  if (scope === "unknown") return "Kompatibilitet ikke oppgitt";
  if (scope === "specific") {
    const count = Array.isArray(attributes?.[PART_FITMENT_VEHICLE_IDS_KEY])
      ? attributes[PART_FITMENT_VEHICLE_IDS_KEY].length
      : 0;
    return count > 0
      ? count === 1
        ? "Selger oppgir 1 kompatibel bilmodell"
        : `Selger oppgir ${count} kompatible bilmodeller`
      : "Selger oppgir kompatibilitet";
  }
  return null;
}

/** Usage metric under the title: kilometers for vehicles, engine hours for
 * boats — whichever the listing's attributes carry. */
export function UsageLabel({
  value,
  unit,
  className,
}: {
  value: number;
  unit: string;
  className?: string;
}) {
  return (
    <p
      className={`flex shrink-0 items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <Gauge className="size-3" />
      {formatNokNumber(value)} {unit}
    </p>
  );
}

/** Vises med store bokstaver via CSS (`uppercase`), så skjermlesere leser
 * ordet og ikke bokstav for bokstav. */
export const SOLD_PRICE_LABEL = "Solgt";

/** Solgte annonser vises en kort stund i søket (se migrasjonen
 * sold_listings_visibility) — merket må synes før man åpner annonsen.
 * Diagonalt hjørnebånd; forelderen må være `relative overflow-hidden`. */
export function SoldBanner({ compact }: { compact: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute z-10 -rotate-45 bg-destructive text-center font-semibold uppercase tracking-wide text-destructive-foreground ${compact ? "-left-[22px] top-2 w-20 py-px text-[0.625rem]" : "-left-[30px] top-[14px] w-[110px] py-0.5 text-xs"}`}
    >
      Solgt
    </span>
  );
}

type Props = {
  listing: ListingCardData;
  highlighted?: boolean;
  onHoverChange?: (id: string | null) => void;
  compact?: boolean;
  /** Renders the same static card surface for pre-publish previews. */
  preview?: boolean;
  linkState?: Record<string, unknown>;
  /** Pre-signed by a result-list batch. Undefined keeps the standalone-card
   * fallback; null means the batch found no usable image. */
  signedImageUrl?: string | null;
  missingPriceLabel?: string;
  knownFavorite?: boolean;
  favoriteStateReady?: boolean;
};

function ListingImage({
  imgUrl,
  hasCoverPath,
  alt,
  compact,
  onError,
}: {
  imgUrl: string | null;
  hasCoverPath: boolean;
  alt: string;
  compact: boolean;
  onError?: () => void;
}) {
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={alt}
        className={`size-full object-cover ${compact ? "" : "transition group-hover:scale-[1.02]"}`}
        loading="lazy"
        onError={onError}
      />
    );
  }
  if (hasCoverPath) {
    return <Skeleton className="size-full rounded-none" />;
  }
  return (
    <div
      className={`flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground ${compact ? "" : "text-xs"}`}
    >
      <ImageOff className={compact ? "size-4" : "size-5"} strokeWidth={1.5} />
      <span className={compact ? "text-xs" : ""}>Ingen bilde</span>
    </div>
  );
}

export function ListingCardContent({
  listing,
  imgUrl,
  missingPriceLabel,
  onImageError,
  imageFailed = false,
}: {
  listing: ListingCardData;
  imgUrl: string | null;
  missingPriceLabel?: string;
  onImageError?: () => void;
  /** Bildet ga feil (f.eks. 404) — vis «Ingen bilde», ikke evig skjelett. */
  imageFailed?: boolean;
}) {
  const displayPrice = displayPriceNok(listing);
  const priceLabel = listing.sold_at
    ? SOLD_PRICE_LABEL
    : !listing.is_free && displayPrice == null && missingPriceLabel
      ? missingPriceLabel
      : formatPrice({ price_nok: displayPrice, is_free: listing.is_free });
  const fitmentLabel = partFitmentLabel(listing.attributes);

  return (
    <>
      <div
        className="relative aspect-[4/3] overflow-hidden bg-muted"
        style={{ aspectRatio: "4 / 3" }}
      >
        <ListingImage
          imgUrl={imgUrl}
          hasCoverPath={!!listing.cover_path && !imageFailed}
          alt={`${listing.title} — ${priceLabel}`}
          compact={false}
          onError={onImageError}
        />
        {listing.sold_at && <SoldBanner compact={false} />}
      </div>
      <div className="density-data px-3">
        <h3 className="truncate text-sm font-medium leading-snug">{listing.title}</h3>
        {listing.subtitle && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
        )}
        {fitmentLabel && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{fitmentLabel}</p>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`font-display text-lg font-semibold text-primary ${listing.sold_at ? "uppercase" : ""}`}
          >
            {priceLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {listing.city && <span>{listing.city}</span>}
          {typeof listing.mileage_km === "number" ? (
            <UsageLabel value={listing.mileage_km} unit="km" />
          ) : typeof listing.engine_hours === "number" ? (
            <UsageLabel value={listing.engine_hours} unit="t" />
          ) : null}
        </div>
      </div>
    </>
  );
}

// Memoisert fordi hover-state i result-list ellers rendrer hele resultatlista
// på nytt for hver musebevegelse mellom kort.
export const ListingCard = memo(function ListingCard({
  listing,
  highlighted,
  onHoverChange,
  compact = false,
  preview = false,
  linkState,
  signedImageUrl,
  missingPriceLabel,
  knownFavorite,
  favoriteStateReady,
}: Props) {
  const priceLabel = listing.sold_at
    ? SOLD_PRICE_LABEL
    : formatPrice({ price_nok: displayPriceNok(listing), is_free: listing.is_free });
  const supportsHover = useRef(true);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    supportsHover.current = window.matchMedia?.("(hover: hover)").matches ?? true;
  }, []);

  // Prøv den lille kort-thumbnailen først; eldre annonser uten en faller
  // tilbake til fullstørrelsesbildet via onError under, siden en ren URL
  // ikke kan fortelle oss på forhånd om thumbnail-filen faktisk finnes.
  const coverPath = listing.cover_path;
  const thumbUrl = coverPath
    ? signListingImageUrls([thumbPathFor(coverPath)])[thumbPathFor(coverPath)]
    : null;
  const originalUrl = coverPath ? signListingImageUrls([coverPath])[coverPath] : null;
  const primaryImageUrl = signedImageUrl !== undefined ? signedImageUrl : thumbUrl;
  const { effectiveImageUrl, imageFailed, handleImageError } = useListingImageFallback(
    primaryImageUrl,
    originalUrl,
  );

  const cardClass = `group relative overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow] duration-150 ${
    highlighted
      ? "border-primary shadow-sm ring-2 ring-primary/20"
      : "border-border hover:border-primary/70 hover:shadow-md"
  }`;
  const linkClass =
    "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  if (preview) {
    return (
      <article className={`${cardClass} text-left`}>
        <ListingCardContent
          listing={listing}
          imgUrl={effectiveImageUrl}
          missingPriceLabel={missingPriceLabel}
          onImageError={handleImageError}
          imageFailed={imageFailed}
        />
      </article>
    );
  }

  if (compact) {
    return (
      <article
        className={`${cardClass} flex items-center`}
        onMouseMove={(e) => {
          if (!supportsHover.current || !effectiveImageUrl) return;
          setHoverPos({ x: e.clientX, y: e.clientY });
        }}
        onMouseLeave={() => setHoverPos(null)}
      >
        <Link
          to="/$kaupetCode"
          params={{ kaupetCode: listing.kaupet_code }}
          state={linkState}
          className={`${linkClass} flex min-w-0 flex-1 gap-3 p-2`}
        >
          <div
            className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
            style={{ width: "5rem", height: "5rem" }}
          >
            <ListingImage
              imgUrl={effectiveImageUrl}
              hasCoverPath={!!listing.cover_path && !imageFailed}
              alt={`${listing.title} — ${priceLabel}`}
              compact
              onError={handleImageError}
            />
            {listing.sold_at && <SoldBanner compact />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
            {listing.subtitle && (
              <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={`font-display text-base font-semibold text-primary ${listing.sold_at ? "uppercase" : ""}`}
              >
                {priceLabel}
              </p>
              {typeof listing.mileage_km === "number" ? (
                <UsageLabel value={listing.mileage_km} unit="km" />
              ) : typeof listing.engine_hours === "number" ? (
                <UsageLabel value={listing.engine_hours} unit="t" />
              ) : null}
            </div>
            {listing.city && <p className="text-xs text-muted-foreground">{listing.city}</p>}
          </div>
        </Link>
        <FavoriteButton
          listingId={listing.id}
          size="sm"
          className="mr-2 shrink-0"
          knownFavorite={knownFavorite}
          favoriteStateReady={favoriteStateReady}
        />
        {/* Flyover-forhåndsvisning som følger musepekeren — kun desktop-hover, ikke i selve thumbnail-boksen. */}
        {hoverPos && effectiveImageUrl && (
          <div
            className="pointer-events-none fixed z-50 size-64 overflow-hidden rounded-lg border border-border bg-muted shadow-xl"
            style={{
              left: Math.min(hoverPos.x + 20, window.innerWidth - 256 - 12),
              top: Math.min(hoverPos.y + 20, window.innerHeight - 256 - 12),
            }}
          >
            <img src={effectiveImageUrl} alt="" className="size-full object-cover" />
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className={cardClass}
      onMouseEnter={onHoverChange ? () => onHoverChange(listing.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
    >
      <Link
        to="/$kaupetCode"
        params={{ kaupetCode: listing.kaupet_code }}
        state={linkState}
        className={linkClass}
        aria-label={`${listing.title}, ${priceLabel}`}
      >
        <ListingCardContent
          listing={listing}
          imgUrl={effectiveImageUrl}
          onImageError={handleImageError}
          imageFailed={imageFailed}
        />
      </Link>
      <FavoriteButton
        listingId={listing.id}
        size="sm"
        className="absolute right-2 top-2"
        knownFavorite={knownFavorite}
        favoriteStateReady={favoriteStateReady}
      />
    </article>
  );
});
