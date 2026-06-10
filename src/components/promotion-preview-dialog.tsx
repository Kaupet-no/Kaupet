import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { activateDemoPromotion, getPromotionPricing } from "@/lib/promotions.functions";
import { formatErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivated?: () => void;
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

export function PromotionPreviewDialog({ listingId, open, onOpenChange, onActivated }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const fetchPricing = useServerFn(getPromotionPricing);
  const { data: pricing } = useQuery({
    queryKey: ["promotion-pricing"],
    queryFn: () => fetchPricing(),
    enabled: open,
  });

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

  const activate = useServerFn(activateDemoPromotion);
  const mutate = useMutation({
    mutationFn: async (duration_days: number) =>
      activate({ data: { listing_id: listingId, duration_days } }),
    onSuccess: () => {
      toast.success("Promotering aktivert (demo)");
      qc.invalidateQueries({ queryKey: ["my-promotions"] });
      qc.invalidateQueries({ queryKey: ["featured-listings"] });
      onActivated?.();
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error(formatErrorMessage(e, "Kunne ikke aktivere promoteringen")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent" /> Promoter annonsen din
          </DialogTitle>
          <DialogDescription>
            Slik vil annonsen din vises i seksjonen «Promoterte annonser» øverst i søkeresultatene.
          </DialogDescription>
        </DialogHeader>

        {/* Preview card */}
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <p className="font-display text-xs uppercase tracking-wide text-muted-foreground">
              Promoterte annonser
            </p>
          </div>
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
              <p className="font-display text-base">
                {listing ? formatPrice(listing) : ""}
              </p>
              {listing?.city && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" /> {listing.city}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing options */}
        <div className="space-y-2">
          {(pricing ?? []).map((p) => (
            <button
              key={p.duration_days}
              type="button"
              onClick={() => setSelected(p.duration_days)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                selected === p.duration_days
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border hover:border-primary"
              }`}
            >
              <div>
                <div className="font-medium">{p.duration_days} dager i toppen</div>
                <div className="text-xs text-muted-foreground">
                  Aktiveres umiddelbart (demo — ingen reell betaling)
                </div>
              </div>
              <div className="font-display text-xl">{p.price_nok} kr</div>
            </button>
          ))}
          {!pricing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Henter priser…
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutate.isPending}>
            Hopp over
          </Button>
          <Button
            disabled={!selected || mutate.isPending}
            onClick={() => selected && mutate.mutate(selected)}
          >
            {mutate.isPending && <Loader2 className="size-4 animate-spin" />}
            Aktiver promotering (demo)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
