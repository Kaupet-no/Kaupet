import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCheck, TrendingDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
type Item = SearchItem | PriceDropItem;

function formatKr(n: number) {
  return new Intl.NumberFormat("nb-NO").format(n) + " kr";
}

function VarslerPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-history", user?.id, pageSize],
    enabled: !!user,
    queryFn: async (): Promise<{ items: Item[]; hasMore: boolean }> => {
      const [notifs, drops] = await Promise.all([
        listNotifications(pageSize, 0),
        listPriceDrops(pageSize, 0),
      ]);
      const listingIds = Array.from(
        new Set([...notifs.map((n) => n.listing_id), ...drops.map((d) => d.listing_id)]),
      );
      const searchIds = Array.from(new Set(notifs.map((n) => n.saved_search_id)));
      const [listingsRes, searchesRes] = await Promise.all([
        listingIds.length
          ? supabase.from("listings").select("id, title, kaupet_code").in("id", listingIds)
          : Promise.resolve({ data: [] as { id: string; title: string; kaupet_code: string }[] }),
        searchIds.length
          ? supabase.from("saved_searches").select("id, name").in("id", searchIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const listingMap = new Map((listingsRes.data ?? []).map((l) => [l.id, l]));
      const searchMap = new Map((searchesRes.data ?? []).map((s) => [s.id, s.name]));

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

      const items = [...searchItems, ...dropItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return { items, hasMore: notifs.length === pageSize || drops.length === pageSize };
    },
  });

  if (!user) return null;

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const handleMarkAllRead = async () => {
    await Promise.all([markAllNotificationsRead(), markAllPriceDropsRead()]);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
  };

  const handleClick = async (n: Item) => {
    if (n.read_at) return;
    if (n.kind === "search") await markNotificationRead(n.id);
    else await markPriceDropRead(n.id);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
  };

  const handleDelete = async (n: Item) => {
    if (n.kind === "search") await deleteNotification(n.id);
    else await deletePriceDrop(n.id);
    qc.invalidateQueries({ queryKey: ["notifications-history"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Mine varsler</h1>
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
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-lg font-medium">Ingen varsler ennå</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lagre et søk for å bli varslet om nye treff.
            </p>
            <Link to="/mine-sok" className="mt-4 inline-block">
              <Button>Mine søk</Button>
            </Link>
          </div>
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
                  className="block px-4 py-3 pr-10 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-60"
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">
                        {n.kind === "price_drop" && (
                          <TrendingDown className="mr-1 inline size-3.5 text-accent" />
                        )}
                        {n.listing_title ??
                          (n.kind === "price_drop" ? "Favoritten din" : "Ny annonse")}
                      </p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {n.kind === "search" ? (
                          <>Treff i "{n.search_name ?? "Lagret søk"}"</>
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
                  className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                  aria-label="Slett varsel"
                >
                  <X className="size-3.5" />
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
  );
}
