import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, TrendingDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Item[]> => {
      const [notifs, drops] = await Promise.all([listNotifications(30), listPriceDrops(30)]);
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

      return [...searchItems, ...dropItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    refetchInterval: 60_000,
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifs:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saved_search_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "favorite_price_drops",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          void refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refetch, qc]);

  // Fallback: refresh når fanen får fokus igjen
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, qc]);

  if (!user) return null;

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  const handleMarkAllRead = async () => {
    await Promise.all([markAllNotificationsRead(), markAllPriceDropsRead()]);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleClick = async (n: Item) => {
    if (n.read_at) return;
    if (n.kind === "search") await markNotificationRead(n.id);
    else await markPriceDropRead(n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleDelete = async (n: Item) => {
    if (n.kind === "search") await deleteNotification(n.id);
    else await deletePriceDrop(n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Varsler" className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
              aria-label={`${unread} uleste varsler`}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Varsler</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Marker alle som lest
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ingen varsler ennå.
              <br />
              <Link to="/mine-sok" className="mt-2 inline-block text-primary hover:underline">
                Lag et lagret søk
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li
                  key={`${n.kind}-${n.id}`}
                  className={`group relative ${!n.read_at ? "bg-primary/5" : ""}`}
                >
                  <Link
                    to="/$kaupetCode"
                    params={{ kaupetCode: n.listing_code ?? "" }}
                    disabled={!n.listing_code}
                    onClick={() => handleClick(n)}
                    className="block px-3 py-2.5 pr-9 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-60"
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
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                    aria-label="Slett varsel"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex divide-x divide-border border-t border-border">
          <Link
            to="/varsler"
            className="flex-1 rounded px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Se alle varsler
          </Link>
          <Link
            to="/mine-sok"
            className="flex-1 rounded px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Administrer lagrede søk
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
