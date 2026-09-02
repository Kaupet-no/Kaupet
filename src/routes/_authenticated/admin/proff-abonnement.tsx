import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import {
  adminListLocationCharges,
  adminListProffOrders,
  adminMarkLocationChargeInvoiced,
  adminMarkProffOrderInvoiced,
  adminMarkProffOrderPaid,
  adminCancelProffOrder,
  type AdminLocationCharge,
  type AdminProffOrder,
} from "@/lib/admin-proff.functions";
import { PROFF_TERMS } from "@/features/business-account/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/admin/proff-abonnement")({
  head: () => ({ meta: [{ title: "Proff-abonnement — Administrasjon" }] }),
  component: AdminProffOrdersPage,
});

const STATUS_OPTIONS = [
  { value: "pending", label: "Til fakturering" },
  { value: "invoiced", label: "Fakturert" },
  { value: "paid", label: "Betalt" },
  { value: "cancelled", label: "Kansellert" },
  { value: "all", label: "Alle" },
] as const;

const STATUS_LABEL: Record<AdminProffOrder["status"], string> = {
  pending: "Til fakturering",
  invoiced: "Fakturert",
  paid: "Betalt",
  cancelled: "Kansellert",
};

function formatNok(value: number) {
  return `${new Intl.NumberFormat("nb-NO").format(value)} kr`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("nb-NO") : "—";
}

function AdminProffOrdersPage() {
  const qc = useQueryClient();
  const listOrders = useServerFn(adminListProffOrders);
  const markInvoiced = useServerFn(adminMarkProffOrderInvoiced);
  const markPaid = useServerFn(adminMarkProffOrderPaid);
  const cancelOrder = useServerFn(adminCancelProffOrder);
  const listLocationCharges = useServerFn(adminListLocationCharges);
  const markLocationChargeInvoiced = useServerFn(adminMarkLocationChargeInvoiced);

  const [status, setStatus] = useState<string>("pending");
  const [invoiceTarget, setInvoiceTarget] = useState<AdminProffOrder | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [locationInvoiceTarget, setLocationInvoiceTarget] = useState<AdminLocationCharge | null>(
    null,
  );
  const [locationInvoiceNumber, setLocationInvoiceNumber] = useState("");

  const ordersQ = useQuery({
    queryKey: ["admin-proff-orders", status],
    queryFn: () =>
      listOrders({ data: { status: status === "all" ? undefined : (status as never) } }),
  });
  const locationChargesQ = useQuery({
    queryKey: ["admin-location-charges"],
    queryFn: () => listLocationCharges(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-proff-orders"] });
    void qc.invalidateQueries({ queryKey: ["admin-location-charges"] });
  };

  const invoice = useMutation({
    mutationFn: (vars: { orderId: string; fikenInvoiceNumber: string }) =>
      markInvoiced({ data: vars }),
    onSuccess: () => {
      showSuccessToast("Merket som fakturert");
      setInvoiceTarget(null);
      setInvoiceNumber("");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre fakturanummer")),
  });

  const pay = useMutation({
    mutationFn: (orderId: string) => markPaid({ data: { orderId } }),
    onSuccess: (result) => {
      showSuccessToast(`Betalt. Proff er aktiv til ${formatDate(result.periodEnd)}.`);
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke registrere betaling")),
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => cancelOrder({ data: { orderId } }),
    onSuccess: () => {
      showSuccessToast("Bestillingen er kansellert");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke kansellere")),
  });
  const locationInvoice = useMutation({
    mutationFn: (vars: {
      subscriptionId: string;
      periodStart: string;
      fikenInvoiceNumber: string;
    }) => markLocationChargeInvoiced({ data: vars }),
    onSuccess: () => {
      showSuccessToast("Lokasjonsperioden er merket som fakturert");
      setLocationInvoiceTarget(null);
      setLocationInvoiceNumber("");
      invalidate();
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke lagre lokasjonsfakturaen")),
  });

  const orders = ordersQ.data ?? [];
  const locationCharges = locationChargesQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl tracking-tight">Proff-abonnement</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="proff-status" className="text-sm text-muted-foreground">
            Status
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="proff-status" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Fakturaene lages manuelt i Fiken. Registrer betaling her for å forlenge Proff-tilgangen.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Laster bestillinger…
            </p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen bestillinger med denne statusen.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bedrift</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Pris eks. mva</TableHead>
                    <TableHead>Fakturaepost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Proff til</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.organization?.legal_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          Org.nr. {order.organization?.organization_number ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.term === "yearly" ? "Årlig" : "Månedlig"}
                        <div className="text-xs text-muted-foreground">
                          {PROFF_TERMS[order.term].months} mnd
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNok(order.price_ex_vat_nok)}
                      </TableCell>
                      <TableCell>
                        <div>{order.billing_email}</div>
                        {order.billing_reference && (
                          <div className="text-xs text-muted-foreground">
                            Ref. {order.billing_reference}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.status === "paid" ? "default" : "secondary"}>
                          {STATUS_LABEL[order.status]}
                        </Badge>
                        {order.fiken_invoice_number && (
                          <div className="text-xs text-muted-foreground">
                            Faktura {order.fiken_invoice_number}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(order.organization?.proff_access_until ?? null)}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.status === "pending" || order.status === "invoiced" ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {order.status === "pending" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInvoiceTarget(order);
                                  setInvoiceNumber("");
                                }}
                              >
                                Fakturert i Fiken
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              disabled={pay.isPending}
                              onClick={() => pay.mutate(order.id)}
                            >
                              Registrer betalt
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={cancel.isPending}
                              onClick={() => cancel.mutate(order.id)}
                            >
                              Kanseller
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {order.period_end ? `Periode til ${formatDate(order.period_end)}` : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lokasjonsperioder til fakturering</CardTitle>
        </CardHeader>
        <CardContent>
          {locationChargesQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Laster lokasjonsperioder…
            </p>
          ) : locationCharges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen lokasjonsperioder til fakturering.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bedrift</TableHead>
                    <TableHead>Lokasjon</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Pris eks. mva</TableHead>
                    <TableHead>Fakturaepost</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locationCharges.map((charge) => (
                    <TableRow key={`${charge.subscription_id}-${charge.period_start}`}>
                      <TableCell>
                        <div className="font-medium">{charge.legal_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{charge.display_name}</div>
                      </TableCell>
                      <TableCell>{charge.location_name}</TableCell>
                      <TableCell>
                        {formatDate(charge.period_start)}–{formatDate(charge.period_end)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNok(charge.amount_ex_vat_nok)}
                      </TableCell>
                      <TableCell>{charge.billing_email || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setLocationInvoiceTarget(charge);
                            setLocationInvoiceNumber("");
                          }}
                        >
                          Fakturert i Fiken
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={invoiceTarget !== null}
        onOpenChange={(open) => !open && setInvoiceTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fakturanummer fra Fiken</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fiken-invoice-number">Fakturanummer</Label>
            <Input
              id="fiken-invoice-number"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="10023"
              inputMode="numeric"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInvoiceTarget(null)}>
              Avbryt
            </Button>
            <Button
              type="button"
              disabled={!invoiceNumber.trim() || invoice.isPending}
              onClick={() =>
                invoiceTarget &&
                invoice.mutate({
                  orderId: invoiceTarget.id,
                  fikenInvoiceNumber: invoiceNumber.trim(),
                })
              }
            >
              {invoice.isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={locationInvoiceTarget !== null}
        onOpenChange={(open) => !open && setLocationInvoiceTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fakturanummer for lokasjonsperiode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="location-fiken-invoice-number">Fakturanummer</Label>
            <Input
              id="location-fiken-invoice-number"
              value={locationInvoiceNumber}
              onChange={(event) => setLocationInvoiceNumber(event.target.value)}
              placeholder="10023"
              inputMode="numeric"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLocationInvoiceTarget(null)}>
              Avbryt
            </Button>
            <Button
              type="button"
              disabled={!locationInvoiceNumber.trim() || locationInvoice.isPending}
              onClick={() =>
                locationInvoiceTarget &&
                locationInvoice.mutate({
                  subscriptionId: locationInvoiceTarget.subscription_id,
                  periodStart: locationInvoiceTarget.period_start,
                  fikenInvoiceNumber: locationInvoiceNumber.trim(),
                })
              }
            >
              {locationInvoice.isPending && (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              )}
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
