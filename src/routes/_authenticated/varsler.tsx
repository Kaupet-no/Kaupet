import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsNative } from "@/hooks/use-is-native";
import { useState } from "react";
import { CheckCheck, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { SystemMessagesCard } from "@/components/system-messages-card";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

import { useAuth } from "@/hooks/use-auth";
import { NotificationItemContent } from "@/components/notification-item-content";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deleteNotificationItem,
  invalidateNotificationQueries,
  listEnrichedNotifications,
  markAllNotificationsRead,
  markNotificationItemRead,
  notificationHistoryQueryKey,
  type NotificationItem,
} from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/varsler")({
  // Ikke gjennomgått for SSR ennå. Forelderen (_authenticated) har SSR på
  // for /mine-annonser; denne ruten beholder klientrendring inntil den er
  // verifisert server-side.
  ssr: false,
  head: () => ({ meta: [{ title: "Mine varsler — Kaupet.no" }] }),
  component: VarslerPage,
});

const PAGE_SIZE = 30;

function VarslerPage() {
  const native = useIsNative();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: native,
    onRefresh: async () => {
      await qc.resetQueries({ queryKey: notificationHistoryQueryKey(user?.id) });
      await qc.resetQueries({ queryKey: ["system-messages"] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: notificationHistoryQueryKey(user?.id, pageSize),
    enabled: !!user,
    queryFn: () => listEnrichedNotifications(pageSize),
  });

  if (!user) return null;

  const items: NotificationItem[] = data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    invalidateNotificationQueries(qc);
  };

  const handleClick = async (n: NotificationItem) => {
    if (n.read_at) return;
    await markNotificationItemRead(n);
    invalidateNotificationQueries(qc);
  };

  const handleDelete = async (n: NotificationItem) => {
    await deleteNotificationItem(n);
    invalidateNotificationQueries(qc);
  };

  return (
    <>
      <NativePageHeader title="Mine varsler" backLabel="Meg" backTo="/meg" />
      {native && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />}
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {!native && (
              <h1 className="font-display text-3xl tracking-tight max-sm:hidden">Mine varsler</h1>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Treff i lagrede søk, prisfall på favoritter og meldinger fra Kaupet-teamet.
            </p>
          </div>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="size-4" /> Marker alle som lest
            </Button>
          )}
        </div>

        <SystemMessagesCard className="mt-6" />

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Ingen varsler ennå"
              description="Lagre et søk for å bli varslet om nye treff."
              action={
                <Link to="/mine-sok">
                  <Button>Gå til mine søk</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {items.map((n) => (
                <li
                  key={`${n.kind}-${n.id}`}
                  className={`group relative ${!n.read_at ? "bg-primary/5" : ""}`}
                >
                  <Link
                    to="/$kaupetCode"
                    params={{ kaupetCode: n.listing_code ?? "" }}
                    disabled={!n.listing_code}
                    onClick={() => handleClick(n)}
                    className="block px-4 py-4 pr-12 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-60"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && (
                        <span
                          className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand"
                          aria-label="Ulest"
                        />
                      )}
                      <NotificationItemContent n={n} />
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(n);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
                    aria-label="Slett varsel"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data?.hasMore && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => setPageSize((n) => n + PAGE_SIZE)}>
                Last flere
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
