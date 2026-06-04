import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { signListingImageUrls } from "@/lib/storage";
import { FavoriteButton } from "@/components/favorite-button";

export type ListingCardData = {
  id: string;
  title: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  created_at: string;
  cover_path: string | null;
};

function formatPrice(p: ListingCardData) {
  if (p.is_free) return "Gis bort";
  if (p.price_nok == null) return "Pris ved henvendelse";
  return `${p.price_nok.toLocaleString("nb-NO")} kr`;
}

type Props = {
  listing: ListingCardData;
  highlighted?: boolean;
  onHoverChange?: (id: string | null) => void;
};

export function ListingCard({ listing, highlighted, onHoverChange }: Props) {
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

  return (
    <Link
      to="/annonse/$id"
      params={{ id: listing.id }}
      onMouseEnter={onHoverChange ? () => onHoverChange(listing.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      className={`group block overflow-hidden rounded-xl border bg-card transition hover:shadow-md ${
        highlighted
          ? "border-primary shadow-md ring-2 ring-primary/30"
          : "border-border hover:border-primary"
      }`}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={listing.title}
            className="size-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Ingen bilde
          </div>
        )}
        <FavoriteButton listingId={listing.id} size="sm" className="absolute right-2 top-2" />
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
        <p className="font-display text-base">{formatPrice(listing)}</p>
        {listing.city && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {listing.city}
          </p>
        )}
      </div>
    </Link>
  );
}
