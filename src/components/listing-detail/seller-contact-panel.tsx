import { Link } from "@tanstack/react-router";
import { MessageCircle, Share2, ShieldCheck, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/favorite-button";
import { ShareListingDialog } from "@/components/share-listing-dialog";
import { StarRating } from "@/components/star-rating";

type Seller = {
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  avg_rating?: number;
  review_count?: number;
} | null;

export function SellerContactPanel({
  isLoggedIn,
  seller,
  isOwner,
  listingId,
  kaupetCode,
  title,
  onContact,
  contacting,
  shareOpen,
  onShareOpenChange,
  isNative,
}: {
  isLoggedIn: boolean;
  seller: Seller;
  isOwner: boolean;
  listingId: string;
  kaupetCode: string;
  title: string;
  onContact: () => void;
  contacting: boolean;
  shareOpen: boolean;
  onShareOpenChange: (open: boolean) => void;
  isNative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        {isLoggedIn && seller?.avatar_url ? (
          <img src={seller.avatar_url} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <UserIcon className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="text-sm">
          {isLoggedIn ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium">{seller?.display_name ?? "Selger"}</p>
                {/* Statisk "Privatperson" inntil vi har forhandlerkontoer —
                    da avgjøres denne av kontotype i stedet for å alltid vise
                    privatperson. */}
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Privatperson
                </Badge>
              </div>
              {!!seller?.review_count && (
                <div
                  className="mt-0.5 flex items-center gap-1.5"
                  aria-label={`${seller.avg_rating?.toFixed(1)} av 5 stjerner, basert på ${seller.review_count} vurderinger`}
                >
                  <StarRating value={seller.avg_rating ?? 0} readOnly size={13} />
                  <span className="text-xs text-muted-foreground">({seller.review_count})</span>
                </div>
              )}
              {seller?.created_at && (
                <p className="text-xs text-muted-foreground">
                  Medlem siden{" "}
                  {new Date(seller.created_at).toLocaleDateString("nb-NO", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Vi viser selgerinfo kun til innloggede brukere, for å beskytte selgere mot spam.{" "}
                <Link to="/auth" className="underline hover:text-foreground">
                  Logg inn
                </Link>{" "}
                for å se den.
              </p>
            </div>
          )}
        </div>
      </div>

      {!isOwner && (
        <Button className="mt-4 w-full gap-2" onClick={onContact} disabled={contacting}>
          <MessageCircle className="size-4" />
          {contacting ? "Åpner samtale…" : "Send melding til selger"}
        </Button>
      )}
      <div className="mt-2 flex flex-col gap-2">
        <FavoriteButton listingId={listingId} variant="full" size="lg" className="w-full" />
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => onShareOpenChange(true)}
        >
          <Share2 className="size-4" /> Del annonse
        </Button>
      </div>

      <ShareListingDialog
        open={shareOpen}
        onOpenChange={onShareOpenChange}
        kaupetCode={kaupetCode}
        title={title}
        isNative={isNative}
      />
    </div>
  );
}
