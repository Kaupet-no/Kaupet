import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Gift, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import {
  adminListPromotionPricing,
  adminUpdatePromotionPricing,
  adminListPromotions,
  adminRefundPromotion,
  adminGiftPromotion,
  adminSearchListingsForGift,
} from "@/lib/admin-promotions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/promoteringer")({
  head: () => ({ meta: [{ title: "Fremhevinger — Administrasjon" }] }),
  component: AdminPromotionsPage,
});

function AdminPromotionsPage() {
  const qc = useQueryClient();
  const listPricing = useServerFn(adminListPromotionPricing);
  const updatePricing = useServerFn(adminUpdatePromotionPricing);
  const listPromos = useServerFn(adminListPromotions);
  const refundPromo = useServerFn(adminRefundPromotion);
  const giftPromo = useServerFn(adminGiftPromotion);
  const searchListings = useServerFn(adminSearchListingsForGift);

  const pricingQ = useQuery({ queryKey: ["admin-promo-pricing"], queryFn: () => listPricing() });
  const promosQ = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () => listPromos({ data: {} }),
  });

  const savePricing = useMutation({
    mutationFn: (vars: { duration_days: number; price_nok: number }) =>
      updatePricing({ data: vars }),
    onSuccess: () => {
      toast.success("Pris oppdatert");
      qc.invalidateQueries({ queryKey: ["admin-promo-pricing"] });
      qc.invalidateQueries({ queryKey: ["promotion-pricing"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke lagre prisen")),
  });

  const refund = useMutation({
    mutationFn: (id: string) => refundPromo({ data: { promotion_id: id } }),
    onSuccess: () => {
      toast.success("Refundert");
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Refusjon feilet")),
  });

  const [giftOpen, setGiftOpen] = useState(false);
  const [giftQuery, setGiftQuery] = useState("");
  const [giftListing, setGiftListing] = useState<{ id: string; title: string } | null>(null);
  const [giftDays, setGiftDays] = useState<3 | 5>(3);
  const [giftReason, setGiftReason] = useState("");

  const giftSearchQ = useQuery({
    queryKey: ["admin-gift-search", giftQuery],
    queryFn: () => searchListings({ data: { q: giftQuery } }),
    enabled: giftQuery.length >= 2 && giftOpen,
  });

  const gift = useMutation({
    mutationFn: () =>
      giftPromo({
        data: {
          listing_id: giftListing!.id,
          duration_days: giftDays,
          reason: giftReason,
        },
      }),
    onSuccess: () => {
      toast.success("Gratis fremheving gitt");
      qc.invalidateQueries({ queryKey: ["admin-promotions"] });
      setGiftOpen(false);
      setGiftListing(null);
      setGiftQuery("");
      setGiftReason("");
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke gi fremheving")),
  });

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Priser</CardTitle>
        </CardHeader>
        <CardContent>
          {pricingQ.isLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(pricingQ.data ?? []).map((p) => (
                <PricingEditor
                  key={p.duration_days}
                  duration={p.duration_days}
                  initial={p.price_nok}
                  onSave={(price) =>
                    savePricing.mutate({ duration_days: p.duration_days, price_nok: price })
                  }
                  busy={savePricing.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fremhevinger</CardTitle>
          <Button onClick={() => setGiftOpen(true)} variant="outline">
            <Gift className="size-4" /> Gi gratis fremheving
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Annonse</TableHead>
                <TableHead>Selger</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="text-right">Beløp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promosQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : (promosQ.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Ingen fremhevinger ennå
                  </TableCell>
                </TableRow>
              ) : (
                (promosQ.data ?? []).map((p: Record<string, unknown> & { id: string; listing_id: string }) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-xs truncate font-medium">
                      <a
                        href={`/annonse/${p.listing_id}`}
                        className="hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.listings?.title ?? p.listing_id}
                      </a>
                    </TableCell>
                    <TableCell>{p.profiles?.display_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.starts_at ? new Date(p.starts_at).toLocaleDateString("nb-NO") : "—"} —{" "}
                      {p.expires_at ? new Date(p.expires_at).toLocaleDateString("nb-NO") : "—"} (
                      {p.duration_days} d)
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.is_gift ? "Gratis" : `${p.price_nok} kr`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "active" || p.status === "gifted" ? "default" : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "active" && !p.is_gift && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Refundere denne fremhevingen?")) refund.mutate(p.id);
                          }}
                          disabled={refund.isPending}
                        >
                          <RefreshCcw className="size-4" /> Refunder
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" /> Gi gratis fremheving
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Søk etter annonse</Label>
              <Input
                placeholder="Skriv tittel…"
                value={giftQuery}
                onChange={(e) => {
                  setGiftQuery(e.target.value);
                  setGiftListing(null);
                }}
              />
              {giftQuery.length >= 2 && !giftListing && (
                <div className="max-h-48 overflow-auto rounded-lg border border-border">
                  {giftSearchQ.isLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Søker…</div>
                  ) : (giftSearchQ.data ?? []).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Ingen treff</div>
                  ) : (
                    (giftSearchQ.data ?? []).map((l: { id: string; title: string }) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setGiftListing({ id: l.id, title: l.title })}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{l.title}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          — {l.profiles?.display_name ?? "?"}
                          {l.city ? `, ${l.city}` : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {giftListing && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm">
                  Valgt: <strong>{giftListing.title}</strong>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Varighet</Label>
              <Select
                value={String(giftDays)}
                onValueChange={(v) => setGiftDays(Number(v) as 3 | 5)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 dager</SelectItem>
                  <SelectItem value="5">5 dager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Begrunnelse</Label>
              <Textarea
                rows={3}
                value={giftReason}
                onChange={(e) => setGiftReason(e.target.value)}
                placeholder="F.eks. kompensasjon for nedetid, vinner av kampanje, …"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGiftOpen(false)}>
              Avbryt
            </Button>
            <Button
              disabled={!giftListing || giftReason.trim().length < 2 || gift.isPending}
              onClick={() => gift.mutate()}
            >
              {gift.isPending && <Loader2 className="size-4 animate-spin" />}
              Gi fremheving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PricingEditor({
  duration,
  initial,
  onSave,
  busy,
}: {
  duration: number;
  initial: number;
  onSave: (price: number) => void;
  busy: boolean;
}) {
  const [val, setVal] = useState(String(initial));
  return (
    <div className="rounded-xl border border-border p-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {duration} dager
      </Label>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="max-w-[120px]"
        />
        <span className="text-sm text-muted-foreground">kr</span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || Number(val) === initial || !val}
          onClick={() => onSave(Number(val))}
        >
          Lagre
        </Button>
      </div>
    </div>
  );
}
