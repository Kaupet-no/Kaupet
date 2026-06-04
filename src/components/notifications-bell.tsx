import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  type SavedSearchNotification,
} from "@/lib/saved-searches";

type Enriched = SavedSearchNotification & {
  listing_title: string | null;
  search_name: string | null;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Enriched[]> => {
      const notifs = await listNotifications(30);
      if (notifs.length === 0) return [];
      const listingIds = Array.from(new Set(notifs.map((n) => n.listing_id)));
      const searchIds = Array.from(new Set(notifs.map((n) => n.saved_search_id)));
      const [listingsRes, searchesRes] = await Promise.all([
        supabase.from("listings").select("id, title").in("id", listingIds),
        supabase.from("saved_searches").select("id, name").in("id", searchIds),
      ]);
      const listingMap = new Map((listingsRes.data ?? []).map((l) => [l.id, l.title]));
      const searchMap = new Map((searchesRes.data ?? []).map((s) => [s.id, s.name]));
      return notifs.map((n) => ({
        ...n,
        listing_title: listingMap.get(n.listing_id) ?? null,
        search_name: searchMap.get(n.saved_search_id) ?? null,
      }));
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
        { event: "*", schema: "public", table: "saved_search_notifications", filter: `user_id=eq.${user.id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, refetch]);

  if (!user) return null;

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleClick = async (n: Enriched) => {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
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
                <li key={n.id} className={`group relative ${!n.read_at ? "bg-primary/5" : ""}`}>
                  <Link
                    to="/annonse/$id"
                    params={{ id: n.listing_id }}
                    onClick={() => handleClick(n)}
                    className="block px-3 py-2.5 pr-9 hover:bg-muted"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">
                          {n.listing_title ?? "Ny annonse"}
                        </p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          Treff i "{n.search_name ?? "Lagret søk"}" ·{" "}
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
                      void handleDelete(n.id);
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
        <div className="border-t border-border px-3 py-2">
          <Link
            to="/mine-sok"
            className="block rounded px-2 py-1 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Administrer lagrede søk
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
