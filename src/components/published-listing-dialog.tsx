import { useState } from "react";
import { Eye, MapPin, Share2, X } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { ShareListingDialog } from "@/components/share-listing-dialog";
import { useListingPreview } from "@/hooks/use-listing-preview";

type Props = {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView: () => void;
  onPromote?: () => void;
  onClose: () => void;
  canPromote?: boolean;
};

export function PublishedListingDialog({
  listingId,
  open,
  onOpenChange,
  onView,
  onPromote,
  onClose,
  canPromote = false,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false);

  const { listing, imgUrl } = useListingPreview(listingId, open);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onClose();
      }}
    >
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Annonsen din er publisert, bra jobba! 🎉
          </DialogTitle>
          <DialogDescription>Annonsen er nå synlig for kjøpere i hele Norge.</DialogDescription>
        </DialogHeader>

        {/* Preview card */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="aspect-[4/3] bg-muted">
            {imgUrl ? (
              <img src={imgUrl} alt={listing?.title ?? ""} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                Ingen bilde
              </div>
            )}
          </div>
          <div className="space-y-1 p-3">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">
              {listing?.title ?? "—"}
            </h3>
            <p className="font-display text-base">{listing ? formatPrice(listing) : ""}</p>
            {listing?.city && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {listing.city}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={onView} className="flex-1">
            <Eye className="size-4" /> Se annonsen
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShareOpen(true)}
            disabled={!listing?.kaupet_code}
            className="flex-1"
          >
            <Share2 className="size-4" /> Del annonsen
          </Button>
          {canPromote && onPromote && (
            <Button
              variant="outline"
              onClick={onPromote}
              className="flex-1 border-brand/40 text-brand-text hover:bg-brand/10 hover:text-brand-text"
            >
              Fremhev annonse
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          onClick={() => {
            onOpenChange(false);
            onClose();
          }}
          className="mt-1 w-full text-muted-foreground"
        >
          <X className="size-4" /> Lukk og gå til mine annonser
        </Button>
      </ResponsiveOverlayContent>
      {listing?.kaupet_code && (
        <ShareListingDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          kaupetCode={listing.kaupet_code}
          title={listing.title}
        />
      )}
    </ResponsiveOverlay>
  );
}
