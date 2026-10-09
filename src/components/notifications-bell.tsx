import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronRight, ShieldAlert, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadSystemMessagesCount } from "@/hooks/use-unread";
import { NotificationItemContent } from "@/components/notification-item-content";
import { useIsNative } from "@/hooks/use-is-native";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSheet } from "@/components/ui/native-sheet";
import {
  deleteNotificationItem,
  invalidateNotificationQueries,
  listEnrichedNotifications,
  markAllNotificationsRead,
  markNotificationItemRead,
  type NotificationItem,
} from "@/lib/notifications";

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidateNotifications = useCallback(() => invalidateNotificationQueries(qc), [qc]);

  const { data, refetch } = useQuery({
    queryKey: ["notifications", user?.id, "preview"],
    enabled: !!user,
    queryFn: async (): Promise<NotificationItem[]> => (await listEnrichedNotifications(30)).items,
    refetchInterval: 60_000,
  });

  // Realtime
  const userId = user?.id;
  useEffect(() => {
    // Depend on the id, not the `user` object — AuthProvider gives it a new
    // reference on every auth event (e.g. TOKEN_REFRESHED), which would
    // otherwise tear down and resubscribe this Realtime channel throughout
    // the session even though the logged-in user hasn't actually changed.
    if (!userId) return;
    const ch = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saved_search_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateNotifications();
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "favorite_price_drops",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateNotifications();
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "favorite_sold_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateNotifications();
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wtb_match_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateNotifications();
          void refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refetch, invalidateNotifications]);

  // Fallback: refresh når fanen får fokus igjen
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      invalidateNotifications();
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
  }, [user, invalidateNotifications]);

  const native = useIsNative();
  const [open, setOpen] = useState(false);
  // Meldinger fra Kaupet-teamet bor på /varsler (SystemMessagesCard). Bjellen
  // er nettets eneste inngang dit, så de telles med i badgen her — samme
  // regel som Meg-fanen i appen.
  const unreadSystem = useUnreadSystemMessagesCount();

  if (!user) return null;

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;
  const badgeCount = unread + unreadSystem;

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    invalidateNotifications();
  };

  const handleClick = async (n: NotificationItem) => {
    if (n.read_at) return;
    await markNotificationItemRead(n);
    invalidateNotifications();
  };

  const handleDelete = async (n: NotificationItem) => {
    await deleteNotificationItem(n);
    invalidateNotifications();
  };

  const bellTrigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={badgeCount > 0 ? `Varsler, ${badgeCount} uleste` : "Varsler"}
      className="relative"
    >
      <Bell className="size-5" />
      {badgeCount > 0 && (
        <span
          className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-brand-foreground"
          aria-hidden="true"
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </Button>
  );

  const notifList = (
    <>
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
      <div className={native ? "min-h-0 flex-1 overflow-y-auto" : "max-h-[400px] overflow-y-auto"}>
        {unreadSystem > 0 && (
          <Link
            to="/varsler"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 border-b border-border bg-primary/5 px-3 py-2.5 hover:bg-muted"
          >
            <ShieldAlert className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Kaupet-teamet</span>
              <span className="block text-xs text-muted-foreground">
                {unreadSystem} {unreadSystem === 1 ? "ulest melding" : "uleste meldinger"}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
        {notifications.length === 0 && unreadSystem > 0 ? null : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Ingen varsler ennå.
            <br />
            <Link
              to="/mine-sok"
              onClick={() => setOpen(false)}
              className="mt-2 inline-block text-primary hover:underline"
            >
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
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
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
          onClick={() => setOpen(false)}
          className="flex-1 rounded px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Se alle varsler
        </Link>
        <Link
          to="/mine-sok"
          onClick={() => setOpen(false)}
          className="flex-1 rounded px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Administrer lagrede søk
        </Link>
      </div>
    </>
  );

  if (native) {
    return (
      <NativeSheet
        open={open}
        onOpenChange={setOpen}
        trigger={bellTrigger}
        title="Varsler"
        expandable
        initialSnapPoint={0.6}
        className="flex flex-col p-0 pb-safe"
      >
        {notifList}
      </NativeSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{bellTrigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-1rem)] p-0">
        {notifList}
      </PopoverContent>
    </Popover>
  );
}
