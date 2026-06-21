import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Gift, RefreshCcw, AlertTriangle, Search, Info } from "lucide-react";
import { toast } from "sonner";

import {
  adminListPromotionPricing,
  adminUpdatePromotionPricing,
  adminListPromotions,
  adminRefundPromotion,
  adminGiftPromotion,
  adminSearchListingsForGift,
  adminGetVippsPaymentStatus,
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

type PromoRow = {
  id: string;
  listing_id: string;
  user_id: string;
  duration_days: number;
  price_nok: number;
  status: string;
  is_gift: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  refunded_at: string | null;
  vipps_reference: string | null;
  vipps_psp_reference: string | null;
  listings: { title: string | null; kaupet_code: string | null } | null;
  profiles: { display_name: string | null } | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Alle statuser" },
  { value: "pending", label: "Venter" },
  { value: "active", label: "Aktiv" },
  { value: "gifted", label: "Gave" },
  { value: "expired", label: "Utløpt" },
  { value: "refunded", label: "Refundert" },
  { value: "failed", label: "Mislyktes" },
];

function AdminPromotionsPage() {
  const qc = useQueryClient();
  const listPricing = useServerFn(adminListPromotionPricing);
  const updatePricing = useServerFn(adminUpdatePromotionPricing);
  const listPromos = useServerFn(adminListPromotions);
  const refundPromo = useServerFn(adminRefundPromotion);
  const giftPromo = useServerFn(adminGiftPromotion);
  const searchListings = useServerFn(adminSearchListingsForGift);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [detailPromo, setDetailPromo] = useState<PromoRow | null>(null);

  const pricingQ = useQuery({ queryKey: ["admin-promo-pricing"], queryFn: () => listPricing() });
  const promosQ = useQuery({
    queryKey: ["admin-promotions", statusFilter, search],
    queryFn: () =>
      listPromos({
        data: {
          status: statusFilter === "all" ? undefined : statusFilter,
          q: search || undefined,
        },
      }),
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
      setDetailPromo(null);
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

  const rows = (promosQ.data ?? []) as unknown as PromoRow[];

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
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Transaksjoner</CardTitle>
          <Button onClick={() => setGiftOpen(true)} variant="outline">
            <Gift className="size-4" /> Gi gratis fremheving
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <div className="w-44">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Søk (Vipps-referanse / PSP)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="f.eks. promo-xxxx eller PSP-ID"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <Button type="submit" variant="outline" size="icon" aria-label="Søk">
                  <Search className="size-4" />
                </Button>
                {search && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setSearchInput("");
                    }}
                  >
                    Tøm
                  </Button>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin-promotions"] })}
            >
              <RefreshCcw className="size-4" /> Oppdater
            </Button>
          </form>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Annonse</TableHead>
                  <TableHead>Selger</TableHead>
                  <TableHead>Opprettet</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Beløp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vipps-ref</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promosQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      Ingen treff
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {p.listings?.kaupet_code ? (
                          <a
                            href={`/${p.listings.kaupet_code}`}
                            className="hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {p.listings?.title ?? p.listing_id}
                          </a>
                        ) : (
                          (p.listings?.title ?? p.listing_id)
                        )}
                      </TableCell>
                      <TableCell>{p.profiles?.display_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("nb-NO")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.starts_at ? new Date(p.starts_at).toLocaleDateString("nb-NO") : "—"} —{" "}
                        {p.expires_at ? new Date(p.expires_at).toLocaleDateString("nb-NO") : "—"} (
                        {p.duration_days} d)
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.is_gift ? "Gratis" : `${p.price_nok} kr`}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.vipps_reference ? (
                          <span title={p.vipps_reference}>
                            {p.vipps_reference.length > 16
                              ? `${p.vipps_reference.slice(0, 14)}…`
                              : p.vipps_reference}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDetailPromo(p)}>
                          <Info className="size-4" /> Detaljer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        promo={detailPromo}
        onClose={() => setDetailPromo(null)}
        onRefund={(id) => {
          if (confirm("Refundere denne fremhevingen? Beløpet føres tilbake i Vipps.")) {
            refund.mutate(id);
          }
        }}
        refunding={refund.isPending}
      />

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
                    (giftSearchQ.data ?? []).map((l) => (
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

function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "active" || status === "gifted"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "refunded"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function DetailDialog({
  promo,
  onClose,
  onRefund,
  refunding,
}: {
  promo: PromoRow | null;
  onClose: () => void;
  onRefund: (id: string) => void;
  refunding: boolean;
}) {
  const getVippsStatus = useServerFn(adminGetVippsPaymentStatus);
  const vippsQ = useQuery({
    queryKey: ["admin-vipps-status", promo?.id],
    queryFn: () => getVippsStatus({ data: { promotion_id: promo!.id } }),
    enabled: !!promo && !promo.is_gift && !!promo.vipps_reference,
  });

  const canRefund =
    !!promo && !promo.is_gift && !!promo.vipps_reference && promo.status !== "refunded";

  return (
    <Dialog open={!!promo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Transaksjonsdetaljer</DialogTitle>
        </DialogHeader>
        {promo && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Annonse" value={promo.listings?.title ?? promo.listing_id} />
              <DetailField label="Selger" value={promo.profiles?.display_name ?? "—"} />
              <DetailField
                label="Beløp"
                value={promo.is_gift ? "Gratis (gave)" : `${promo.price_nok} kr`}
              />
              <DetailField label="Varighet" value={`${promo.duration_days} dager`} />
              <DetailField
                label="Opprettet"
                value={new Date(promo.created_at).toLocaleString("nb-NO")}
              />
              <DetailField label="Intern status" value={<StatusBadge status={promo.status} />} />
              {promo.refunded_at && (
                <DetailField
                  label="Refundert"
                  value={new Date(promo.refunded_at).toLocaleString("nb-NO")}
                />
              )}
            </div>

            {promo.is_gift ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
                Dette er en gratis fremheving — ingen Vipps-betaling tilknyttet.
              </div>
            ) : (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Vipps-betaling</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => vippsQ.refetch()}
                    disabled={vippsQ.isFetching}
                  >
                    {vippsQ.isFetching ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-4" />
                    )}
                    Oppdater
                  </Button>
                </div>
                <DetailField
                  label="Vipps-referanse"
                  value={<code className="text-xs">{promo.vipps_reference ?? "—"}</code>}
                />
                {promo.vipps_psp_reference && (
                  <DetailField
                    label="PSP-referanse"
                    value={<code className="text-xs">{promo.vipps_psp_reference}</code>}
                  />
                )}
                {vippsQ.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Henter status fra Vipps…
                  </div>
                ) : vippsQ.data && "error" in vippsQ.data && vippsQ.data.error ? (
                  <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-destructive">
                    {vippsQ.data.error}
                  </div>
                ) : vippsQ.data && vippsQ.data.hasVipps ? (
                  <div className="space-y-2">
                    <DetailField label="Miljø" value={vippsQ.data.mode} />
                    {"state" in vippsQ.data && (
                      <DetailField
                        label="Vipps-status"
                        value={<Badge variant="secondary">{vippsQ.data.state}</Badge>}
                      />
                    )}
                    {"amountNok" in vippsQ.data && vippsQ.data.amountNok !== undefined && (
                      <DetailField label="Beløp hos Vipps" value={`${vippsQ.data.amountNok} kr`} />
                    )}
                    {"mismatch" in vippsQ.data && vippsQ.data.mismatch && (
                      <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/5 p-2 text-warning-foreground">
                        <AlertTriangle className="size-4 mt-0.5 text-warning" />
                        <div>
                          Intern status og Vipps-status er ulik. Sjekk webhook-leveranse og vurder å
                          oppdatere manuelt.
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Lukk
          </Button>
          {canRefund && promo && (
            <Button variant="destructive" onClick={() => onRefund(promo.id)} disabled={refunding}>
              {refunding && <Loader2 className="size-4 animate-spin" />}
              <RefreshCcw className="size-4" /> Refunder {promo.price_nok} kr
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{value}</div>
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
