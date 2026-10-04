import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { invalidateAdminEvents } from "@/hooks/use-admin-events";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EVENT_KINDS, eventMeta, timeAgo, type AdminEventKind } from "./-admin-events";

export const Route = createFileRoute("/_authenticated/admin/hendelser")({
  head: () => ({ meta: [{ title: "Hendelser — Administrasjon — Kaupet.no" }] }),
  component: AdminEventsPage,
});

function AdminEventsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showHandled, setShowHandled] = useState(false);
  const [kind, setKind] = useState<AdminEventKind | null>(null);

  const events = useQuery({
    queryKey: ["admin-events", showHandled, kind],
    queryFn: async () => {
      let q = supabase
        .from("admin_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!showHandled) q = q.is("handled_at", null);
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const handle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("admin_events")
        .update({ handled_at: new Date().toISOString(), handled_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAdminEvents(qc),
    onError: (e) => showErrorToast(formatErrorMessage(e, "Kunne ikke markere som håndtert")),
  });

  return (
    <section aria-labelledby="admin-events-title" className="space-y-6">
      <div className="max-w-2xl">
        <h2 id="admin-events-title" className="font-display text-3xl tracking-tight">
          Hendelser
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ting som venter på en administrator. En hendelse lukkes når noen håndterer den — enten
          direkte på siden den lenker til, eller med «Marker som håndtert».
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer hendelser">
        <FilterChip pressed={!showHandled} onClick={() => setShowHandled(false)}>
          Åpne
        </FilterChip>
        <FilterChip pressed={showHandled} onClick={() => setShowHandled(true)}>
          Alle
        </FilterChip>
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
        {(Object.keys(EVENT_KINDS) as AdminEventKind[]).map((k) => (
          <FilterChip key={k} pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
            {EVENT_KINDS[k].label}
          </FilterChip>
        ))}
      </div>

      {events.isLoading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">Laster hendelser</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" aria-hidden="true" />
          ))}
        </div>
      ) : events.isError ? (
        <EmptyState title="Kunne ikke hente hendelser" description="Prøv igjen om litt." />
      ) : !events.data?.length ? (
        <EmptyState
          icon={Inbox}
          title={showHandled ? "Ingen hendelser" : "Alt er håndtert"}
          description={showHandled ? undefined : "Nye hendelser dukker opp her automatisk."}
          className="p-8 sm:p-10"
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {events.data.map((event) => {
            const meta = eventMeta(event.kind);
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-4 border-b border-border p-4 last:border-b-0 sm:flex-nowrap sm:px-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <meta.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{event.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {meta.label} · {timeAgo(event.created_at)}
                    {event.handled_at && <> · Håndtert {timeAgo(event.handled_at)}</>}
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                    <Link to={meta.to}>Åpne</Link>
                  </Button>
                  {!event.handled_at && (
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={handle.isPending && handle.variables === event.id}
                      onClick={() => handle.mutate(event.id)}
                    >
                      {handle.isPending && handle.variables === event.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-4" aria-hidden="true" />
                      )}
                      Marker som håndtert
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
