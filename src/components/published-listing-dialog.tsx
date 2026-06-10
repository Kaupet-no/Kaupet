import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, MapPin, Share2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView: () => void;
  onPromote?: () => void;
  onClose: () => void;
  canPromote?: boolean;
};

type PreviewData = {
  title: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  cover_path: string | null;
};

function formatPrice(p: { price_nok: number | null; is_free: boolean }) {
  if (p.is_free) return "Gis bort";
  if (p.price_nok == null) return "Pris ved henvendelse";
  return `${p.price_nok.toLocaleString("nb-NO")} kr`;
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
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const { data: listing } = useQuery({
    queryKey: ["listing-preview", listingId],
    enabled: open,
    queryFn: async (): Promise<PreviewData | null> => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "title, price_nok, is_free, city, listing_images(storage_path, sort_order)",
        )
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const cover =
        (data.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.storage_path ?? null;
      return {
        title: data.title,
        price_nok: data.price_nok,
        is_free: data.is_free,
        city: data.city,
        cover_path: cover,
      };
    },
  });

  useEffect(() => {
    if (!listing?.cover_path) {
      setImgUrl(null);
      return;
    }
    let cancelled = false;
    signListingImageUrls([listing.cover_path]).then((m) => {
      if (!cancelled) setImgUrl(m[listing.cover_path!] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.cover_path]);

  async function handleShare() {
    const url = `${window.location.origin}/annonse/${listingId}`;
    const shareData = {
      title: listing?.title ?? "Annonse på Kaupet.no",
      text: listing?.title ?? "Se annonsen min på Kaupet.no",
      url,
    };
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lenken er kopiert til utklippstavlen");
    } catch {
      toast.error("Kunne ikke dele annonsen");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Annonsen din er publisert, bra jobba! 🎉
          </DialogTitle>
          <DialogDescription>
            Annonsen er nå synlig for kjøpere i hele Norge.
          </DialogDescription>
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
          <Button variant="secondary" onClick={handleShare} className="flex-1">
            <Share2 className="size-4" /> Del annonsen
          </Button>
          {canPromote && onPromote && (
            <Button
              variant="outline"
              onClick={onPromote}
              className="flex-1 border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
            >
              <Sparkles className="size-4" /> Promoter
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
      </DialogContent>
    </Dialog>
  );
}
