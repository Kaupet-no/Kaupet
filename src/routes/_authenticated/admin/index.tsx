import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, UserPlus, ListChecks, MessagesSquare, Loader2 } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
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

  return (
    <div className="space-y-8">
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
            <ResponsiveContainer width="100%" height={288}>
              <LineChart data={timeseries.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
              {value !== undefined ? Number(value).toLocaleString("nb-NO") : "—"}
            </div>
            {subValue && <div className="mt-1 text-xs text-muted-foreground">{subValue}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
