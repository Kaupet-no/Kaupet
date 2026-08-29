import { Link } from "@tanstack/react-router";
import { Gauge, ImageOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signListingImageUrls, thumbPathFor } from "@/lib/storage";
import { formatPrice, displayPriceNok } from "@/lib/format";
import { FavoriteButton } from "@/components/favorite-button";
import { Skeleton } from "@/components/ui/skeleton";
import { PART_FITMENT_SCOPE_KEY, PART_FITMENT_VEHICLE_IDS_KEY } from "@/lib/category-filters";

export type ListingCardData = {
  id: string;
  kaupet_code: string;
  title: string;
  subtitle?: string | null;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  created_at: string;
  cover_path: string | null;
  total_views?: number;
  views_last_week?: number;
  mileage_km?: number | null;
  engine_hours?: number | null;
  category_slug?: string | null;
  attributes?: Record<string, unknown> | null;
};
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
      {value.toLocaleString("nb-NO")} {unit}
    </p>
  );
}

type Props = {
  listing: ListingCardData;
  highlighted?: boolean;
  onHoverChange?: (id: string | null) => void;
  compact?: boolean;
  linkState?: Record<string, unknown>;
  onOpen?: () => void;
  /** Pre-signed by a result-list batch. Undefined keeps the standalone-card
   * fallback; null means the batch found no usable image. */
  signedImageUrl?: string | null;
  knownFavorite?: boolean;
  favoriteStateReady?: boolean;
};

function ListingImage({
  imgUrl,
  hasCoverPath,
  alt,
  compact,
}: {
  imgUrl: string | null;
  hasCoverPath: boolean;
  alt: string;
  compact: boolean;
}) {
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={alt}
        className={`size-full object-cover ${compact ? "" : "transition group-hover:scale-[1.02]"}`}
        loading="lazy"
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
      <span className={compact ? "text-[11px]" : ""}>Ingen bilde</span>
    </div>
  );
}

export function ListingCardContent({
  listing,
  imgUrl,
  missingPriceLabel,
}: {
  listing: ListingCardData;
  imgUrl: string | null;
  missingPriceLabel?: string;
}) {
  const displayPrice = displayPriceNok(listing);
  const priceLabel =
    !listing.is_free && displayPrice == null && missingPriceLabel
      ? missingPriceLabel
      : formatPrice({ price_nok: displayPrice, is_free: listing.is_free });
  const fitmentLabel = partFitmentLabel(listing.attributes);

  return (
    <>
      <div className="relative aspect-[4/3] bg-muted" style={{ aspectRatio: "4 / 3" }}>
        <ListingImage
          imgUrl={imgUrl}
          hasCoverPath={!!listing.cover_path}
          alt={`${listing.title} — ${priceLabel}`}
          compact={false}
        />
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
          <p className="font-display text-lg font-semibold text-primary">{priceLabel}</p>
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

export function ListingCard({
  listing,
  highlighted,
  onHoverChange,
  compact = false,
  linkState,
  onOpen,
  signedImageUrl,
  knownFavorite,
  favoriteStateReady,
}: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const priceLabel = formatPrice({ price_nok: displayPriceNok(listing), is_free: listing.is_free });
  const supportsHover = useRef(true);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    supportsHover.current = window.matchMedia?.("(hover: hover)").matches ?? true;
  }, []);

  useEffect(() => {
    if (signedImageUrl !== undefined) return;
    const coverPath = listing.cover_path;
    if (!coverPath) return;
    let cancelled = false;
    // Prøv den lille kort-thumbnailen først; eldre annonser uten en faller
    // tilbake til fullstørrelsesbildet.
    const thumbPath = thumbPathFor(coverPath);
    signListingImageUrls([thumbPath]).then(async (map) => {
      if (cancelled) return;
      if (map[thumbPath]) {
        setImgUrl(map[thumbPath]);
        return;
      }
      const fallback = await signListingImageUrls([coverPath]);
      if (!cancelled) setImgUrl(fallback[coverPath] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.cover_path, signedImageUrl]);

  const effectiveImageUrl = signedImageUrl !== undefined ? signedImageUrl : imgUrl;

  const cardClass = `group relative overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow] duration-150 ${
    highlighted
      ? "border-primary shadow-sm ring-2 ring-primary/20"
      : "border-border hover:border-primary/70 hover:shadow-md"
  }`;
  const linkClass =
    "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

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
          onClick={onOpen}
          className={`${linkClass} flex min-w-0 flex-1 gap-3 p-2`}
        >
          <div
            className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
            style={{ width: "5rem", height: "5rem" }}
          >
            <ListingImage
              imgUrl={effectiveImageUrl}
              hasCoverPath={!!listing.cover_path}
              alt={`${listing.title} — ${priceLabel}`}
              compact
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
            {listing.subtitle && (
              <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-base font-semibold text-primary">{priceLabel}</p>
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
        onClick={onOpen}
        className={linkClass}
        aria-label={`${listing.title}, ${priceLabel}`}
      >
        <ListingCardContent listing={listing} imgUrl={effectiveImageUrl} />
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
}
