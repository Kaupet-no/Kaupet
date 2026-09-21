import { useEffect, useState } from "react";
import { Eye, MapPin, Share2, X } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { ShareListingDialog } from "@/components/share-listing-dialog";
import { useListingPreview } from "@/hooks/use-listing-preview";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

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
  // Callback-ref framfor useRef: dialoginnholdet monteres i en portal etter
  // at foreldrekomponenten har kjørt effektene sine, så en vanlig ref er
  // fortsatt null når effekten under først kjører.
  const [confettiCanvas, setConfettiCanvas] = useState<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  const { listing, imgUrl } = useListingPreview(listingId, open);

  useEffect(() => {
    if (!open || reducedMotion || !confettiCanvas) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void (async () => {
      try {
        const confetti = (await import("canvas-confetti")).default;
        if (cancelled) return;
        const fire = confetti.create(confettiCanvas, { resize: true, useWorker: false });
        // Regn nedover fra toppen av dialogen: flere små skudd på tilfeldig
        // x-posisjon i stedet for feedback-panelets enkeltskudd nedenfra.
        for (let i = 0; i < 5; i++) {
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              void fire({
                particleCount: 20,
                spread: 100,
                startVelocity: 12,
                gravity: 0.9,
                ticks: 200,
                origin: { x: Math.random(), y: 0 },
              });
            }, i * 200),
          );
        }
      } catch {
        // Konfetti er dekorasjon — skal aldri blokkere dialogen.
      }
    })();
    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [open, reducedMotion, confettiCanvas]);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onClose();
      }}
    >
      <ResponsiveOverlayContent className="relative sm:max-w-lg">
        <canvas
          ref={setConfettiCanvas}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 size-full"
        />
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
