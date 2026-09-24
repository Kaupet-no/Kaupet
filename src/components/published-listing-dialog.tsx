import { useEffect, useState } from "react";
import { Check, Eye, Share2 } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { generateBrandedQrDataUrl, QR_SIZE } from "@/lib/qr";
import { isNative, shareContent } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
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

/** "48210937" -> "4821 0937" — kun visuell gruppering av den 8-sifrede koden. */
function formatKaupetCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

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
  const [codeCopied, setCodeCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const { listing, imgUrl } = useListingPreview(listingId, open);
  const url = listing?.kaupet_code ? `https://kaupet.no/${listing.kaupet_code}` : null;

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    generateBrandedQrDataUrl(url)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl);
      })
      .catch(() => {
        /* QR er dekorasjon på lappen — skal aldri blokkere dialogen */
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copyCode() {
    if (!listing?.kaupet_code) return;
    try {
      await navigator.clipboard.writeText(listing.kaupet_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      /* Kopiering feilet stille — koden er fortsatt synlig for manuell kopi */
    }
  }

  async function handleShare() {
    if (!listing) return;
    if (isNative()) {
      void import("@/lib/haptics").then((m) => m.hapticImpact("light"));
      try {
        await shareContent({
          title: listing.title,
          url: url ?? "https://kaupet.no",
        });
      } catch {
        // Bruker avbrutt deling
      }
      return;
    }
    setShareOpen(true);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onClose();
      }}
    >
      <ResponsiveOverlayContent className="bg-secondary sm:max-w-md">
        <div className="flex flex-col items-center gap-5 px-2 py-4">
          {/* Lappen */}
          <div
            className={cn(
              "relative w-full max-w-[19rem] rotate-[-1.5deg] rounded-sm bg-card p-4 shadow-md",
              !reducedMotion && "animate-[lappen-pin-in_220ms_ease-out]",
            )}
          >
            <span
              aria-hidden
              className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
            />

            <div className="mb-3 aspect-[4/3] overflow-hidden rounded-sm bg-muted">
              {imgUrl ? (
                <img src={imgUrl} alt={listing?.title ?? ""} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  Ingen bilde
                </div>
              )}
            </div>

            <h3 className="line-clamp-2 font-display text-lg leading-snug">
              {listing?.title ?? "—"}
            </h3>
            {listing && <p className="font-display text-xl">{formatPrice(listing)}</p>}

            {listing?.kaupet_code && (
              <>
                <div className="my-3 border-t border-dashed border-border" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Kaupet-kode
                    </p>
                    <button
                      type="button"
                      onClick={copyCode}
                      className="native-touch-target -ml-1 rounded px-1 font-mono text-lg tracking-wider hover:bg-muted"
                      aria-label="Kopier Kaupet-kode"
                    >
                      {formatKaupetCode(listing.kaupet_code)}
                    </button>
                    <p
                      className="flex h-4 items-center gap-1 text-xs text-muted-foreground"
                      aria-live="polite"
                    >
                      {codeCopied && (
                        <>
                          <Check className="size-3" /> Kopiert
                        </>
                      )}
                    </p>
                  </div>
                  {qrSrc && (
                    <img
                      src={qrSrc}
                      alt="QR-kode til annonsen"
                      width={QR_SIZE}
                      height={QR_SIZE}
                      className="size-16 shrink-0 rounded-sm bg-white p-0.5"
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className="text-center">
            <DialogTitle className="font-display text-xl font-normal">
              Lappen henger ute
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Annonsen er publisert og synlig for alle nå.
            </DialogDescription>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button onClick={handleShare} disabled={!listing?.kaupet_code} className="w-full">
            <Share2 className="size-4" /> Del lappen
          </Button>
          <Button variant="secondary" onClick={onView} className="w-full">
            <Eye className="size-4" /> Se annonsen
          </Button>
          {canPromote && onPromote && (
            <button
              type="button"
              onClick={onPromote}
              className="mx-auto text-sm text-brand-text underline underline-offset-2"
            >
              Fremhev annonse
            </button>
          )}
        </div>
      </ResponsiveOverlayContent>
      {listing?.kaupet_code && (
        <ShareListingDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          kaupetCode={listing.kaupet_code}
          title={listing.title}
          isNative={isNative()}
        />
      )}
    </ResponsiveOverlay>
  );
}
