import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsNative } from "@/hooks/use-is-native";
import { useState } from "react";
import { CheckCheck, ShoppingBag, TrendingDown, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listNotifications,
  listPriceDrops,
  markAllNotificationsRead,
  markAllPriceDropsRead,
  markNotificationRead,
  markPriceDropRead,
  deleteNotification,
  deletePriceDrop,
  type SavedSearchNotification,
  type PriceDropNotification,
} from "@/lib/saved-searches";
import {
  listWtbMatchNotifications,
  markAllWtbMatchNotificationsRead,
  markWtbMatchNotificationRead,
  deleteWtbMatchNotification,
  type WtbMatchNotification,
} from "@/lib/wtb-listings.functions";

export const Route = createFileRoute("/_authenticated/varsler")({
  head: () => ({ meta: [{ title: "Mine varsler — Kaupet.no" }] }),
  component: VarslerPage,
});

const PAGE_SIZE = 30;

type SearchItem = SavedSearchNotification & {
  kind: "search";
  listing_title: string | null;
  listing_code: string | null;
  search_name: string | null;
};
type PriceDropItem = PriceDropNotification & {
  kind: "price_drop";
  listing_title: string | null;
  listing_code: string | null;
};
type WtbMatchItem = WtbMatchNotification & {
  kind: "wtb_match";
  listing_title: string | null;
  listing_code: string | null;
  wtb_title: string | null;
};
type Item = SearchItem | PriceDropItem | WtbMatchItem;

function formatKr(n: number) {
  return new Intl.NumberFormat("nb-NO").format(n) + " kr";
}

function VarslerPage() {
  const native = useIsNative();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: native,
    onRefresh: () => qc.resetQueries({ queryKey: ["notifications-history"] }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-history", user?.id, pageSize],
    enabled: !!user,
    queryFn: async (): Promise<{ items: Item[]; hasMore: boolean }> => {
      const [notifs, drops, wtbMatches] = await Promise.all([
        listNotifications(pageSize, 0),
        listPriceDrops(pageSize, 0),
        listWtbMatchNotifications(pageSize, 0),
      ]);
      const listingIds = Array.from(
        new Set([
          ...notifs.map((n) => n.listing_id),
          ...drops.map((d) => d.listing_id),
          ...wtbMatches.map((m) => m.listing_id),
        ]),
      );
      const searchIds = Array.from(new Set(notifs.map((n) => n.saved_search_id)));
      const wtbListingIds = Array.from(new Set(wtbMatches.map((m) => m.wtb_listing_id)));
      const [listingsRes, searchesRes, wtbListingsRes] = await Promise.all([
        listingIds.length
          ? supabase.from("listings").select("id, title, kaupet_code").in("id", listingIds)
          : Promise.resolve({ data: [] as { id: string; title: string; kaupet_code: string }[] }),
        searchIds.length
          ? supabase.from("saved_searches").select("id, name").in("id", searchIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        wtbListingIds.length
          ? supabase.from("wtb_listings").select("id, title").in("id", wtbListingIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const listingMap = new Map((listingsRes.data ?? []).map((l) => [l.id, l]));
      const searchMap = new Map((searchesRes.data ?? []).map((s) => [s.id, s.name]));
      const wtbListingMap = new Map((wtbListingsRes.data ?? []).map((w) => [w.id, w.title]));

      const searchItems: SearchItem[] = notifs.map((n) => ({
        ...n,
        kind: "search",
        listing_title: listingMap.get(n.listing_id)?.title ?? null,
        listing_code: listingMap.get(n.listing_id)?.kaupet_code ?? null,
        search_name: searchMap.get(n.saved_search_id) ?? null,
      }));
      const dropItems: PriceDropItem[] = drops.map((d) => ({
        ...d,
        kind: "price_drop",
        listing_title: listingMap.get(d.listing_id)?.title ?? null,
        listing_code: listingMap.get(d.listing_id)?.kaupet_code ?? null,
      }));
      const wtbMatchItems: WtbMatchItem[] = wtbMatches.map((m) => ({
        ...m,
        kind: "wtb_match",
        listing_title: listingMap.get(m.listing_id)?.title ?? null,
        listing_code: listingMap.get(m.listing_id)?.kaupet_code ?? null,
        wtb_title: wtbListingMap.get(m.wtb_listing_id) ?? null,
      }));

      const items = [...searchItems, ...dropItems, ...wtbMatchItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return {
        items,
        hasMore:
          notifs.length === pageSize || drops.length === pageSize || wtbMatches.length === pageSize,
      };
    },
  });

  if (!user) return null;

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const handleMarkAllRead = async () => {
    await Promise.all([
      markAllNotificationsRead(),
      markAllPriceDropsRead(),
      markAllWtbMatchNotificationsRead(),
    ]);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
  };

  const handleClick = async (n: Item) => {
    if (n.read_at) return;
    if (n.kind === "search") await markNotificationRead(n.id);
    else if (n.kind === "price_drop") await markPriceDropRead(n.id);
    else await markWtbMatchNotificationRead(n.id);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
  };

  const handleDelete = async (n: Item) => {
    if (n.kind === "search") await deleteNotification(n.id);
    else if (n.kind === "price_drop") await deletePriceDrop(n.id);
    else await deleteWtbMatchNotification(n.id);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
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
              Treff i lagrede søk og prisfall på favoritter.
            </p>
          </div>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="size-4" /> Marker alle som lest
            </Button>
          )}
        </div>

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
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">
                          {n.kind === "price_drop" && (
                            <TrendingDown className="mr-1 inline size-3.5 text-brand" />
                          )}
                          {n.kind === "wtb_match" && (
                            <ShoppingBag className="mr-1 inline size-3.5 text-brand" />
                          )}
                          {n.listing_title ??
                            (n.kind === "price_drop" ? "Favoritten din" : "Ny annonse")}
                        </p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {n.kind === "search" ? (
                            <>Treff i "{n.search_name ?? "Lagret søk"}"</>
                          ) : n.kind === "wtb_match" ? (
                            <>Treff på "{n.wtb_title ?? "Ønskes kjøpt"}"</>
                          ) : (
                            <>
                              Prisfall −{Number(n.drop_pct).toFixed(0)} % ·{" "}
                              {formatKr(n.old_price_nok)} → {formatKr(n.new_price_nok)}
                            </>
                          )}{" "}
                          ·{" "}
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: nb,
                          })}
                        </p>
                      </div>
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
