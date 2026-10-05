import { formatNokNumber } from "@/lib/format";
import { lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  UserPlus,
  ListChecks,
  MessagesSquare,
  Loader2,
  ChevronRight,
  Flag,
  BadgeCheck,
  Receipt,
  FolderPlus,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EventLinkRow, type AdminEventKind } from "./-admin-events";

// recharts er ~95 KiB brotli og trengs ikke i første maling — kun
// visningsgrafen under bruker den.
const AdminViewsChart = lazy(() =>
  import("./-admin-chart").then((m) => ({ default: m.AdminViewsChart })),
);

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Administrasjon — Kaupet.no" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview_stats");
      if (error) throw error;
      return data?.[0];
    },
  });

  const timeseries = useQuery({
    queryKey: ["admin", "timeseries", 30],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_views_timeseries", { _days: 30 });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        day: r.day,
        views: Number(r.views),
        label: new Date(r.day).toLocaleDateString("nb-NO", { day: "2-digit", month: "short" }),
      }));
    },
  });

  const popular = useQuery({
    queryKey: ["admin", "popular-listings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_popular_listings", { _limit: 10 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const categories = useQuery({
    queryKey: ["admin", "popular-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_popular_categories");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ponytail: henter inntil 500 åpne hendelser og teller per område i klienten;
  // bytt til en gruppert RPC hvis køen noen gang blir så lang.
  const openEvents = useQuery({
    queryKey: ["admin-events", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_events")
        .select("*")
        .is("handled_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const countKinds = (...kinds: AdminEventKind[]) =>
    openEvents.data?.filter((e) => kinds.includes(e.kind as AdminEventKind)).length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="admin-attention-title" className="space-y-6">
        <div className="max-w-2xl">
          <h2 id="admin-attention-title" className="font-display text-3xl tracking-tight">
            Trenger oppmerksomhet
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Åpne hendelser fordelt på hvor de håndteres.
          </p>
        </div>
        {openEvents.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              Kunne ikke hente åpne hendelser.
              {openEvents.data && " Viste tall kan være utdaterte."}
              <Button
                type="button"
                variant="outline"
                className="ml-3"
                disabled={openEvents.isFetching}
                onClick={() => void openEvents.refetch()}
              >
                Prøv igjen
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <AttentionCard
            to="/admin/moderasjon"
            icon={<Flag className="size-4" aria-hidden="true" />}
            label="Rapporter"
            count={countKinds("listing_reported", "user_reported")}
            loading={openEvents.isLoading}
          />
          <AttentionCard
            to="/admin/bedrifter"
            icon={<BadgeCheck className="size-4" aria-hidden="true" />}
            label="Nye bedrifter"
            count={countKinds("organization_registered")}
            loading={openEvents.isLoading}
          />
          <AttentionCard
            to="/admin/proff-abonnement"
            icon={<Receipt className="size-4" aria-hidden="true" />}
            label="Proff og fakturering"
            count={countKinds(
              "proff_ordered",
              "proff_trial_started",
              "proff_cancelled",
              "proff_invoice_due",
              "proff_payment_overdue",
            )}
            loading={openEvents.isLoading}
          />
          <AttentionCard
            to="/admin/tilbakemeldinger"
            icon={<FolderPlus className="size-4" aria-hidden="true" />}
            label="Kategoriforslag"
            count={countKinds("category_suggestion")}
            loading={openEvents.isLoading}
          />
        </div>
        {!!openEvents.data?.length && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold">Siste hendelser</h3>
              <Link
                to="/admin/hendelser"
                className="text-sm font-medium text-primary hover:underline"
              >
                Se alle
              </Link>
            </div>
            {openEvents.data.slice(0, 5).map((event) => (
              <EventLinkRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      <div className="max-w-2xl">
        <h2 className="font-display text-3xl tracking-tight">Statistikk</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Trafikk, brukere og annonser på tvers av Kaupet.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Visninger (7 dager)"
          value={overview.data?.views_7d}
          icon={<Eye className="size-4" />}
          loading={overview.isLoading}
        />
        <StatCard
          title="Visninger (30 dager)"
          value={overview.data?.views_30d}
          icon={<Eye className="size-4" />}
          loading={overview.isLoading}
        />
        <StatCard
          title="Nye brukere (30 dager)"
          value={overview.data?.new_users_30d}
          icon={<UserPlus className="size-4" />}
          loading={overview.isLoading}
        />
        <StatCard
          title="Aktive annonser"
          value={overview.data?.active_listings}
          subValue={`av ${overview.data?.total_listings ?? "—"} totalt`}
          icon={<ListChecks className="size-4" />}
          loading={overview.isLoading}
        />
        <StatCard
          title="Samtaler totalt"
          value={overview.data?.conversations_total}
          icon={<MessagesSquare className="size-4" />}
          loading={overview.isLoading}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Daglige visninger (30 dager)</CardTitle>
        </CardHeader>
        <CardContent>
          {timeseries.isLoading ? (
            <div className="flex h-72 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-[288px] w-full rounded-lg" />}>
              <AdminViewsChart data={timeseries.data ?? []} />
            </Suspense>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mest populære annonser</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tittel</TableHead>
                  <TableHead className="text-right">Visninger</TableHead>
                  <TableHead className="text-right">Favoritter</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popular.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : popular.data && popular.data.length > 0 ? (
                  popular.data.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-xs truncate font-medium">
                        <a
                          href={`/annonse/${l.id}`}
                          className="hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {l.title}
                        </a>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.view_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.favorite_count}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === "active" ? "default" : "secondary"}>
                          {l.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Ingen annonser ennå
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Populære kategorier</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Annonser</TableHead>
                  <TableHead className="text-right">Visninger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : categories.data && categories.data.length > 0 ? (
                  categories.data.slice(0, 10).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name_nb}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.listing_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.view_count}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Ingen kategorier
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AttentionCard({
  to,
  icon,
  label,
  count,
  loading,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count: number | undefined;
  loading: boolean;
}) {
  return (
    <Link
      to={to}
      className="block bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5"
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
        <ChevronRight className="ml-auto size-4" aria-hidden="true" />
      </p>
      <p
        className={`mt-3 text-lg font-semibold tabular-nums ${(count ?? 0) > 0 ? "text-primary" : ""}`}
      >
        {loading || count === undefined
          ? "—"
          : count === 0
            ? "Ingen åpne"
            : `${count} ${count === 1 ? "åpen" : "åpne"}`}
      </p>
    </Link>
  );
}

function StatCard({
  title,
  value,
  subValue,
  icon,
  loading,
}: {
  title: string;
  value: number | bigint | undefined;
  subValue?: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-semibold tabular-nums">
              {value !== undefined ? formatNokNumber(Number(value)) : "—"}
            </div>
            {subValue && <div className="mt-1 text-xs text-muted-foreground">{subValue}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
