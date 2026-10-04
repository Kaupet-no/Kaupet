import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import {
  adminCancelProffOrder,
  adminEndProffAgreement,
  adminListLocationCharges,
  adminListProffOrders,
  adminListProffUpcomingInvoices,
  adminMarkLocationChargeInvoiced,
  adminMarkProffOrderPaid,
  adminRegisterProffInvoiceSent,
  adminRegisterProffReminder,
  type AdminLocationCharge,
  type AdminProffOrder,
  type AdminProffUpcomingInvoice,
} from "@/lib/admin-proff.functions";
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";
import { formatProffTermPrice } from "@/features/business-account/proff-pricing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
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
import { formatDate, formatNok } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { invalidateAdminEvents } from "@/hooks/use-admin-events";

export const Route = createFileRoute("/_authenticated/admin/proff-abonnement")({
  head: () => ({ meta: [{ title: "Proff-abonnement — Administrasjon" }] }),
  component: AdminProffOrdersPage,
});

const STATUS_OPTIONS = [
  { value: "invoiced", label: "Sendt, ikke betalt" },
  { value: "paid", label: "Betalt" },
  { value: "cancelled", label: "Kansellert" },
  { value: "all", label: "Alle" },
] as const;

const STATUS_LABEL: Record<AdminProffOrder["status"], string> = {
  pending: "Ikke sendt",
  invoiced: "Sendt",
  paid: "Betalt",
  cancelled: "Kansellert",
};

const TERM_LABEL: Record<ProffTerm, string> = { monthly: "Månedlig", yearly: "Årlig" };
const MIN_PAYMENT_DAYS = 14;

/** Dagens dato i Oslo som YYYY-MM-DD, for <input type="date">. */
function todayOslo() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
}

function dateOrDash(value: string | null) {
  return value ? formatDate(value) : "—";
}

type SentTarget = {
  title: string;
  orderId: string | null;
  organizationId: string;
  term: ProffTerm;
  dueOn: string;
};
type DateTarget = { kind: "reminder" | "paid"; order: AdminProffOrder };

function AdminProffOrdersPage() {
  const qc = useQueryClient();
  const listOrders = useServerFn(adminListProffOrders);
  const listUpcoming = useServerFn(adminListProffUpcomingInvoices);
  const registerSent = useServerFn(adminRegisterProffInvoiceSent);
  const registerReminder = useServerFn(adminRegisterProffReminder);
  const markPaid = useServerFn(adminMarkProffOrderPaid);
  const cancelOrder = useServerFn(adminCancelProffOrder);
  const listLocationCharges = useServerFn(adminListLocationCharges);
  const markLocationChargeInvoiced = useServerFn(adminMarkLocationChargeInvoiced);

  const [status, setStatus] = useState<string>("invoiced");
  const [sentTarget, setSentTarget] = useState<SentTarget | null>(null);
  const [dateTarget, setDateTarget] = useState<DateTarget | null>(null);
  const [locationInvoiceTarget, setLocationInvoiceTarget] = useState<AdminLocationCharge | null>(
    null,
  );
  const [locationInvoiceNumber, setLocationInvoiceNumber] = useState("");

  const upcomingQ = useQuery({
    queryKey: ["admin-proff-upcoming"],
    queryFn: () => listUpcoming(),
  });
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
    void qc.invalidateQueries({ queryKey: ["admin-proff-upcoming"] });
    void qc.invalidateQueries({ queryKey: ["admin-location-charges"] });
    invalidateAdminEvents(qc);
  };

  const sent = useMutation({
    mutationFn: (vars: {
      orderId?: string;
      organizationId?: string;
      term?: ProffTerm;
      fikenInvoiceNumber: string;
      sentOn: string;
      dueOn: string;
    }) => registerSent({ data: vars }),
    onSuccess: () => {
      showSuccessToast("Fakturaen er registrert som sendt");
      setSentTarget(null);
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke registrere fakturaen")),
  });

  const dated = useMutation({
    mutationFn: async ({ target, date }: { target: DateTarget; date: string }) => {
      if (target.kind === "reminder") {
        await registerReminder({ data: { orderId: target.order.id, sentOn: date } });
        return "Påminnelsen er registrert";
      }
      const result = await markPaid({ data: { orderId: target.order.id, paidOn: date } });
      return `Betalt. Proff er aktiv til ${dateOrDash(result.periodEnd)}.`;
    },
    onSuccess: (message) => {
      showSuccessToast(message);
      setDateTarget(null);
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre")),
  });

  const endAgreementFn = useServerFn(adminEndProffAgreement);
  const endAgreement = useMutation({
    mutationFn: (vars: { organizationId: string; note?: string }) => endAgreementFn({ data: vars }),
    onSuccess: (result) => {
      showSuccessToast(
        result.accessUntil
          ? `Avtalen er avsluttet. Proff varer til ${formatDate(result.accessUntil)}, og bedriften varsles på e-post.`
          : "Avtalen er avsluttet, og bedriften varsles på e-post.",
      );
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke avslutte avtalen")),
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => cancelOrder({ data: { orderId } }),
    onSuccess: () => {
      showSuccessToast("Fakturaen er kansellert");
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

  const today = todayOslo();
  const upcoming = upcomingQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const locationCharges = locationChargesQ.data ?? [];

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl tracking-tight">Proff-abonnement</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Proff er et løpende abonnement som faktureres manuelt fra Fiken, månedlig eller årlig.
          Første faktura har forfall når prøveperioden utløper. Send hver faktura minst{" "}
          {MIN_PAYMENT_DAYS} dager før forfall, helst tidligere, og registrer den her. Proff
          forlenges først når betalingen er registrert.
        </p>
      </div>

      <section aria-labelledby="proff-upcoming-title" className="space-y-4">
        <h3 id="proff-upcoming-title" className="text-lg font-semibold">
          Fakturaer som skal sendes
        </h3>
        {upcomingQ.isLoading ? (
          <Loading label="Laster fakturaer som skal sendes…" />
        ) : upcoming.length === 0 ? (
          <EmptyState title="Ingen fakturaer å sende" className="p-8" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bedrift</TableHead>
                  <TableHead>Abonnement</TableHead>
                  <TableHead>Forfall</TableHead>
                  <TableHead>Send innen</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((row) => (
                  <UpcomingRow
                    key={row.order_id ?? row.organization_id}
                    row={row}
                    today={today}
                    onRegister={() =>
                      setSentTarget({
                        title: row.legal_name,
                        orderId: row.order_id,
                        organizationId: row.organization_id,
                        term: row.term,
                        dueOn: row.due_on,
                      })
                    }
                    endAction={
                      <EndAgreementButton
                        organizationName={row.legal_name}
                        disabled={endAgreement.isPending}
                        onConfirm={(note) =>
                          endAgreement.mutate({ organizationId: row.organization_id, note })
                        }
                      />
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="proff-invoices-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 id="proff-invoices-title" className="text-lg font-semibold">
            Fakturaer
          </h3>
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
        {ordersQ.isLoading ? (
          <Loading label="Laster fakturaer…" />
        ) : orders.length === 0 ? (
          <EmptyState title="Ingen fakturaer med denne statusen" className="p-8" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bedrift</TableHead>
                  <TableHead>Faktura</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Sendt</TableHead>
                  <TableHead>Forfall</TableHead>
                  <TableHead>Påminnelse</TableHead>
                  <TableHead>Betalt</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const open = order.status === "invoiced";
                  const overdue = open && !!order.invoice_due_on && order.invoice_due_on < today;
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.organization?.legal_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          Org.nr. {order.organization?.organization_number ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="tabular-nums">{order.fiken_invoice_number ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {TERM_LABEL[order.term]} · {formatNok(order.price_ex_vat_nok)} eks. mva
                        </div>
                        <Badge
                          variant={order.status === "paid" ? "default" : "secondary"}
                          className="mt-1"
                        >
                          {STATUS_LABEL[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {order.period_start && order.period_end
                          ? `${formatDate(order.period_start)}–${formatDate(order.period_end)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dateOrDash(order.invoice_sent_on)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dateOrDash(order.invoice_due_on)}
                        {overdue && (
                          <Badge variant="destructive" className="mt-1 block w-fit">
                            Forfalt
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {order.reminder_sent_on ? (
                          formatDate(order.reminder_sent_on)
                        ) : open ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDateTarget({ kind: "reminder", order })}
                          >
                            Registrer
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {order.paid_on ? (
                          formatDate(order.paid_on)
                        ) : open ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setDateTarget({ kind: "paid", order })}
                          >
                            Registrer betalt
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {open || order.status === "pending" ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <CancelButton
                              disabled={cancel.isPending}
                              onConfirm={() => cancel.mutate(order.id)}
                            />
                            <EndAgreementButton
                              organizationName={order.organization?.legal_name ?? "bedriften"}
                              disabled={endAgreement.isPending}
                              onConfirm={(note) =>
                                endAgreement.mutate({ organizationId: order.organization_id, note })
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {order.admin_note ?? ""}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="location-charges-title" className="space-y-4">
        <h3 id="location-charges-title" className="text-lg font-semibold">
          Lokasjonsperioder til fakturering
        </h3>
        {locationChargesQ.isLoading ? (
          <Loading label="Laster lokasjonsperioder…" />
        ) : locationCharges.length === 0 ? (
          <EmptyState title="Ingen lokasjonsperioder til fakturering" className="p-8" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
                      {dateOrDash(charge.period_start)}–{dateOrDash(charge.period_end)}
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
      </section>

      {sentTarget && (
        <InvoiceSentDialog
          key={sentTarget.orderId ?? sentTarget.organizationId}
          target={sentTarget}
          pending={sent.isPending}
          onClose={() => setSentTarget(null)}
          onSubmit={(values) =>
            sent.mutate(
              sentTarget.orderId
                ? { orderId: sentTarget.orderId, ...values }
                : { organizationId: sentTarget.organizationId, ...values },
            )
          }
        />
      )}

      {dateTarget && (
        <DateDialog
          key={`${dateTarget.kind}-${dateTarget.order.id}`}
          title={dateTarget.kind === "reminder" ? "Registrer påminnelse" : "Registrer betaling"}
          description={`Faktura ${dateTarget.order.fiken_invoice_number ?? ""} til ${
            dateTarget.order.organization?.legal_name ?? "bedriften"
          }.${dateTarget.kind === "paid" ? " Proff forlenges med en hel periode." : ""}`}
          label={dateTarget.kind === "reminder" ? "Påminnelse sendt" : "Betalt dato"}
          pending={dated.isPending}
          onClose={() => setDateTarget(null)}
          onSubmit={(date) => dated.mutate({ target: dateTarget, date })}
        />
      )}

      <ResponsiveOverlay
        open={locationInvoiceTarget !== null}
        onOpenChange={(open) => !open && setLocationInvoiceTarget(null)}
      >
        <ResponsiveOverlayContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fakturanummer for lokasjonsperiode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="location-fiken-invoice-number">Fakturanummer</Label>
            <Input
              id="location-fiken-invoice-number"
              value={locationInvoiceNumber}
              onChange={(event) => setLocationInvoiceNumber(event.target.value)}
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
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </p>
  );
}

function UpcomingRow({
  row,
  today,
  onRegister,
  endAction,
}: {
  row: AdminProffUpcomingInvoice;
  today: string;
  onRegister: () => void;
  endAction: React.ReactNode;
}) {
  const daysLeft = daysBetween(today, row.send_by);
  const inTrial =
    !!row.order_id && !!row.trial_ends_at && row.trial_ends_at > new Date().toISOString();
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.legal_name || "—"}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Org.nr. {row.organization_number || "—"} · {row.billing_email || "ingen fakturaepost"}
        </div>
      </TableCell>
      <TableCell>
        {TERM_LABEL[row.term]}
        <div className="text-xs text-muted-foreground">{formatProffTermPrice(row.term)}</div>
        {inTrial ? (
          <Badge variant="outline" className="mt-1">
            Prøveperiode
          </Badge>
        ) : (
          !row.order_id && (
            <Badge variant="outline" className="mt-1">
              Neste periode
            </Badge>
          )
        )}
      </TableCell>
      <TableCell className="tabular-nums">{formatDate(row.due_on)}</TableCell>
      <TableCell className="tabular-nums">
        {formatDate(row.send_by)}
        <div className="mt-1">
          {daysLeft < 0 ? (
            <Badge variant="destructive">Forsinket</Badge>
          ) : (
            <span
              className={`text-xs ${daysLeft <= 7 ? "font-semibold text-primary" : "text-muted-foreground"}`}
            >
              {daysLeft === 0 ? "I dag" : `Om ${daysLeft} ${daysLeft === 1 ? "dag" : "dager"}`}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-1">
          <Button type="button" size="sm" onClick={onRegister}>
            Registrer sendt faktura
          </Button>
          {endAction}
        </div>
      </TableCell>
    </TableRow>
  );
}

function InvoiceSentDialog({
  target,
  pending,
  onClose,
  onSubmit,
}: {
  target: SentTarget;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    fikenInvoiceNumber: string;
    sentOn: string;
    dueOn: string;
    term: ProffTerm;
  }) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [sentOn, setSentOn] = useState(todayOslo());
  const [dueOn, setDueOn] = useState(target.dueOn);
  const [term, setTerm] = useState<ProffTerm>(target.term);
  const paymentDays = sentOn && dueOn ? daysBetween(sentOn, dueOn) : null;
  const valid = invoiceNumber.trim() && sentOn && dueOn && dueOn >= sentOn;

  return (
    <ResponsiveOverlay open onOpenChange={(open) => !open && !pending && onClose()}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrer sendt faktura</DialogTitle>
          <DialogDescription>{target.title}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pending) {
              onSubmit({ fikenInvoiceNumber: invoiceNumber.trim(), sentOn, dueOn, term });
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="proff-invoice-number">Fakturanummer fra Fiken</Label>
            <Input
              id="proff-invoice-number"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              inputMode="numeric"
              required
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proff-invoice-sent">Sendt dato</Label>
              <Input
                id="proff-invoice-sent"
                type="date"
                value={sentOn}
                onChange={(event) => setSentOn(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proff-invoice-due">Forfall</Label>
              <Input
                id="proff-invoice-due"
                type="date"
                value={dueOn}
                min={sentOn}
                onChange={(event) => setDueOn(event.target.value)}
                required
              />
            </div>
          </div>
          {!target.orderId && (
            <div className="space-y-2">
              <Label htmlFor="proff-invoice-term">Periode</Label>
              <Select value={term} onValueChange={(value) => setTerm(value as ProffTerm)}>
                <SelectTrigger id="proff-invoice-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROFF_TERMS) as ProffTerm[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TERM_LABEL[value]} · {formatProffTermPrice(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {paymentDays !== null && paymentDays >= 0 && paymentDays < MIN_PAYMENT_DAYS && (
            <Alert variant="warning">
              <AlertDescription>
                Bare {paymentDays} {paymentDays === 1 ? "dag" : "dager"} betalingsfrist. Fakturaen
                skal sendes minst {MIN_PAYMENT_DAYS} dager før forfall.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!valid || pending} aria-busy={pending}>
              {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function DateDialog({
  title,
  description,
  label,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  label: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (date: string) => void;
}) {
  const [date, setDate] = useState(todayOslo());
  return (
    <ResponsiveOverlay open onOpenChange={(open) => !open && !pending && onClose()}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (date && !pending) onSubmit(date);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="proff-event-date">{label}</Label>
            <Input
              id="proff-event-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!date || pending} aria-busy={pending}>
              {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function CancelButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}>
          Kanseller
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kansellere fakturaen?</AlertDialogTitle>
          <AlertDialogDescription>
            Fakturaen blir ikke registrert som betalt, og Proff forlenges ikke. Krediter den i Fiken
            hvis den allerede er sendt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Behold</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Kanseller fakturaen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EndAgreementButton({
  organizationName,
  disabled,
  onConfirm,
}: {
  organizationName: string;
  disabled: boolean;
  onConfirm: (note: string | undefined) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <AlertDialog onOpenChange={(open) => open && setNote("")}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}>
          Avslutt avtale
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Avslutte Proff-avtalen for {organizationName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Åpne fakturaer kanselleres, og det sendes ingen nye. Proff varer ut perioden som er
            betalt. Bedriften får en e-post om at avtalen er avsluttet, og kan ikke angre selv.
            Krediter sendte fakturaer i Fiken.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="proff-end-note">Internt notat (valgfritt, sendes ikke til kunden)</Label>
          <Textarea
            id="proff-end-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Behold avtalen</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(note.trim() || undefined)}>
            Avslutt avtalen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
