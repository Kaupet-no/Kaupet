import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

import { getPromotionReceipt } from "@/lib/promotions.functions";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";


export const Route = createFileRoute("/_authenticated/kvittering/$promoId")({
  head: () => ({
    meta: [
      { title: "Kvittering — Kaupet.no" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Kvittering for fremheving av annonse." },
    ],
  }),
  component: ReceiptPage,
  errorComponent: ReceiptError,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Fant ikke kvittering</h1>
      <p className="mt-2 text-muted-foreground">
        Vi finner ikke denne kvitteringen. Den kan tilhøre en annen bruker.
      </p>
      <Button asChild className="mt-6">
        <Link to="/mine-annonser">Til mine annonser</Link>
      </Button>
    </div>
  ),
});

function ReceiptError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <AlertCircle className="mx-auto size-10 text-destructive" />
      <h1 className="mt-4 font-display text-2xl">Kunne ikke laste kvittering</h1>
      <p className="mt-2 text-muted-foreground">{formatErrorMessage(error)}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Prøv igjen
        </Button>
        <Button asChild>
          <Link to="/mine-annonser">Mine annonser</Link>
        </Button>
      </div>
    </div>
  );
}

const nokFormatter = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function ReceiptPage() {
  const { promoId } = Route.useParams();
  const fetchReceipt = useServerFn(getPromotionReceipt);

  const { data, isPending, error } = useQuery({
    queryKey: ["promotion-receipt", promoId],
    queryFn: () => fetchReceipt({ data: { promotion_id: promoId } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "pending" ? 3000 : false;
    },
  });

  if (isPending) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    throw error ?? new Error("Fant ikke kvittering");
  }

  const isActive = data.status === "active" || data.status === "gifted";
  const isPending2 = data.status === "pending";
  const isFailed = data.status === "failed" || data.status === "refunded";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="text-center">
        {isFailed ? (
          <AlertCircle className="mx-auto size-14 text-destructive" />
        ) : (
          <CheckCircle2 className="mx-auto size-14 text-primary" />
        )}
        <h1 className="mt-4 font-display text-3xl tracking-tight sm:text-4xl">
          {isFailed ? "Noe gikk galt" : "Takk!"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isActive && "Annonsen din er nå fremhevet."}
          {isPending2 && "Betalingen er mottatt og bekreftes om noen sekunder."}
          {isFailed && "Betalingen ble ikke fullført. Du har ikke blitt belastet."}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-display text-lg">Kvittering</h2>
        <dl className="mt-4 divide-y divide-border text-sm">
          <Row label="Annonse" value={data.listing.title || "—"} />
          <Row label="Varighet" value={`${data.duration_days} dager`} />
          <Row label="Beløp" value={nokFormatter.format(data.price_nok)} />
          <Row label="Kjøpsdato" value={formatDate(data.created_at)} />
          {isActive && <Row label="Fremhevet til" value={formatDate(data.expires_at)} />}
          <Row
            label="Status"
            value={
              isActive
                ? "Aktiv"
                : isPending2
                  ? "Venter på bekreftelse"
                  : data.status === "failed"
                    ? "Mislyktes"
                    : data.status === "refunded"
                      ? "Refundert"
                      : String(data.status)
            }
          />
          {data.vipps_reference && (
            <Row
              label="Vipps-referanse"
              value={<span className="font-mono text-xs">{data.vipps_reference}</span>}
            />
          )}
        </dl>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {data.listing.kaupet_code && (
          <Button asChild size="lg">
            <Link to="/$kaupetCode" params={{ kaupetCode: data.listing.kaupet_code }}>
              Se annonsen
            </Link>
          </Button>
        )}
        <Button asChild size="lg" variant="outline">
          <Link to="/mine-annonser">Mine annonser</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
