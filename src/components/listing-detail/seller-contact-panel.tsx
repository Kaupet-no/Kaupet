import { MessageCircle, Share2, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/favorite-button";
import { ShareListingDialog } from "@/components/share-listing-dialog";

type Seller = { display_name: string | null; avatar_url: string | null; created_at: string } | null;

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
              </div>
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
            <p className="text-muted-foreground">Logg inn for å se informasjon om selger</p>
          )}
        </div>
      </div>

      {!isOwner && (
        <Button className="mt-4 w-full gap-2" onClick={onContact} disabled={contacting}>
          <MessageCircle className="size-4" />
          {contacting ? "Åpner samtale…" : "Send melding til selger"}
        </Button>
      )}
      <FavoriteButton listingId={listingId} variant="full" size="lg" className="mt-2" />
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full gap-2"
        onClick={() => onShareOpenChange(true)}
      >
        <Share2 className="size-4" /> Del annonse
      </Button>
      <ShareListingDialog
        open={shareOpen}
        onOpenChange={onShareOpenChange}
        kaupetCode={kaupetCode}
        title={title}
      />
    </div>
  );
}
