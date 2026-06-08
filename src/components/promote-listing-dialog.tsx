import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPromotionCheckout, getPromotionPricing } from "@/lib/promotions.functions";
import { formatErrorMessage } from "@/lib/errors";

type Props = {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PromoteListingDialog({ listingId, open, onOpenChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);

  const fetchPricing = useServerFn(getPromotionPricing);
  const { data: pricing } = useQuery({
    queryKey: ["promotion-pricing"],
    queryFn: () => fetchPricing(),
    enabled: open,
  });

  const startCheckout = useServerFn(createPromotionCheckout);
  const checkout = useMutation({
    mutationFn: async (duration_days: number) =>
      startCheckout({ data: { listing_id: listingId, duration_days } }),
    onSuccess: (res) => {
      window.location.href = res.redirect_url;
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke starte betalingen")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent" /> Fremhev annonsen
          </DialogTitle>
          <DialogDescription>
            Fremhevede annonser vises i en egen seksjon øverst i relevante søk og kategorier. Inntil
            to fremhevede annonser vises om gangen — en av plassene er din.
          </DialogDescription>
        </DialogHeader>

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
                <div className="font-medium">{p.duration_days} dager fremhevet</div>
                <div className="text-xs text-muted-foreground">
                  Aktiveres umiddelbart etter betaling
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

        <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={accepted}
            onCheckedChange={(v) => setAccepted(Boolean(v))}
            className="mt-0.5"
          />
          <span>
            Jeg har lest{" "}
            <a href="/vilkar#kjopsvilkar" target="_blank" className="underline">
              vilkår for kjøp
            </a>{" "}
            og samtykker til at fremhevingen leveres umiddelbart, slik at angreretten bortfaller
            (angrerettloven § 22 bokstav n).
          </span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            disabled={!selected || !accepted || checkout.isPending}
            onClick={() => selected && checkout.mutate(selected)}
          >
            {checkout.isPending && <Loader2 className="size-4 animate-spin" />}
            Betal med Vipps
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
