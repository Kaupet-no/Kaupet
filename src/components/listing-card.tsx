import { Link } from "@tanstack/react-router";
import { Eye, Gauge, ImageOff, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { signListingImageUrls } from "@/lib/storage";
import { formatPrice } from "@/lib/format";
import { FavoriteButton } from "@/components/favorite-button";
import { useIsNative } from "@/hooks/use-is-native";

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
};

function MileageLabel({ mileageKm, className }: { mileageKm: number; className?: string }) {
  return (
    <p
      className={`flex shrink-0 items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <Gauge className="size-3" />
      {mileageKm.toLocaleString("nb-NO")} km
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
  alt,
  compact,
}: {
  imgUrl: string | null;
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

  useEffect(() => {
    if (!listing.cover_path) return;
    let cancelled = false;
    signListingImageUrls([listing.cover_path]).then((map) => {
      if (!cancelled) setImgUrl(map[listing.cover_path!] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.cover_path]);

  const linkClass = `group block overflow-hidden rounded-xl border bg-card transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    highlighted
      ? "border-primary shadow-md ring-2 ring-primary/30"
      : "border-border hover:border-primary"
  }`;

  if (compact) {
    return (
      <Link
        to="/$kaupetCode"
        params={{ kaupetCode: listing.kaupet_code }}
        state={linkState}
        className={`${linkClass} flex gap-3 p-2`}
      >
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          <ListingImage
            imgUrl={imgUrl}
            alt={`${listing.title} — ${formatPrice(listing)}`}
            compact
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
          {listing.subtitle && (
            <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-base font-semibold">{formatPrice(listing)}</p>
            {typeof listing.mileage_km === "number" && (
              <MileageLabel mileageKm={listing.mileage_km} />
            )}
          </div>
          {listing.city && <p className="text-xs text-muted-foreground">{listing.city}</p>}
        </div>
        <FavoriteButton listingId={listing.id} size="sm" className="shrink-0 self-center" />
      </Link>
    );
  }

  return (
    <Link
      to="/$kaupetCode"
      params={{ kaupetCode: listing.kaupet_code }}
      state={linkState}
      onMouseEnter={onHoverChange ? () => onHoverChange(listing.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      className={linkClass}
    >
      <div className="relative aspect-[4/3] bg-muted">
        <ListingImage
          imgUrl={imgUrl}
          alt={`${listing.title} — ${formatPrice(listing)}`}
          compact={false}
        />
        <FavoriteButton listingId={listing.id} size="sm" className="absolute right-2 top-2" />
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
        {listing.subtitle && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{listing.subtitle}</p>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <p className={`font-display ${isNative ? "text-lg font-semibold" : "text-base"}`}>
            {formatPrice(listing)}
          </p>
          {typeof listing.mileage_km === "number" && (
            <MileageLabel mileageKm={listing.mileage_km} />
          )}
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
  );
}
