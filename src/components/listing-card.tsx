import { Link } from "@tanstack/react-router";
import { Eye, Gauge, ImageOff, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { signListingImageUrls, thumbPathFor } from "@/lib/storage";
import { formatPrice } from "@/lib/format";
import { computeListingTotalPriceKr } from "@/lib/vehicle/vehicle-classification";
import { FavoriteButton } from "@/components/favorite-button";
import { useIsNative } from "@/hooks/use-is-native";
import { Skeleton } from "@/components/ui/skeleton";

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

/** Vehicle listing cards show the price including omregistreringsavgift —
 * same total as the listing detail page — not just what the seller set. */
function displayPriceNok(listing: ListingCardData): number | null {
  return (
    computeListingTotalPriceKr(listing.category_slug, listing.price_nok, listing.attributes) ??
    listing.price_nok
  );
}

/** Usage metric under the title: kilometers for vehicles, engine hours for
 * boats — whichever the listing's attributes carry. */
function UsageLabel({
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
      className={`flex size-full flex-col items-center justify-center gap-1 text-muted-foreground ${compact ? "" : "text-xs"}`}
    >
      <ImageOff className={compact ? "size-4" : "size-5"} strokeWidth={1.5} />
      <span className={compact ? "text-[11px]" : ""}>Ingen bilde</span>
    </div>
  );
}

export function ListingCard({
  listing,
  highlighted,
  onHoverChange,
  compact = false,
  linkState,
}: Props) {
  const isNative = useIsNative();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const priceLabel = formatPrice({ price_nok: displayPriceNok(listing), is_free: listing.is_free });

  useEffect(() => {
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
  }, [listing.cover_path]);

  const cardClass = `group relative overflow-hidden rounded-xl border bg-card transition hover:shadow-md ${
    highlighted
      ? "border-primary shadow-md ring-2 ring-primary/30"
      : "border-border hover:border-primary"
  }`;
  const linkClass =
    "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  if (compact) {
    return (
      <article className={`${cardClass} flex items-center`}>
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
              imgUrl={imgUrl}
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
              <p className="font-display text-base font-semibold">{priceLabel}</p>
              {typeof listing.mileage_km === "number" ? (
                <UsageLabel value={listing.mileage_km} unit="km" />
              ) : typeof listing.engine_hours === "number" ? (
                <UsageLabel value={listing.engine_hours} unit="t" />
              ) : null}
            </div>
            {listing.city && <p className="text-xs text-muted-foreground">{listing.city}</p>}
          </div>
        </Link>
        <FavoriteButton listingId={listing.id} size="sm" className="mr-2 shrink-0" />
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
      >
        <div className="relative aspect-[4/3] bg-muted" style={{ aspectRatio: "4 / 3" }}>
          <ListingImage
            imgUrl={imgUrl}
            hasCoverPath={!!listing.cover_path}
            alt={`${listing.title} — ${priceLabel}`}
            compact={false}
          />
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
          {listing.subtitle && (
            <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <p className={`font-display ${isNative ? "text-lg font-semibold" : "text-base"}`}>
              {priceLabel}
            </p>
            {typeof listing.mileage_km === "number" ? (
              <UsageLabel value={listing.mileage_km} unit="km" />
            ) : typeof listing.engine_hours === "number" ? (
              <UsageLabel value={listing.engine_hours} unit="t" />
            ) : null}
          </div>
          {listing.city && (
            <p
              className={`text-xs text-muted-foreground ${isNative ? "" : "flex items-center gap-1"}`}
            >
              {!isNative && <MapPin className="size-3" />} {listing.city}
            </p>
          )}
          {typeof listing.total_views === "number" && (
            <p
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={`${listing.total_views.toLocaleString("nb-NO")} visninger totalt · ${(listing.views_last_week ?? 0).toLocaleString("nb-NO")} siste syv dager`}
            >
              <Eye className="size-3" />
              <span>{listing.total_views.toLocaleString("nb-NO")}</span>
              <span className="text-muted-foreground/70">
                · {(listing.views_last_week ?? 0).toLocaleString("nb-NO")} siste syv dager
              </span>
            </p>
          )}
        </div>
      </Link>
      <FavoriteButton listingId={listing.id} size="sm" className="absolute right-2 top-2" />
    </article>
  );
}
