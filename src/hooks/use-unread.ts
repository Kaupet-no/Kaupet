import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isUnread } from "@/lib/unread";
import { isNative } from "@/lib/native";

export type ConvSummary = {
  id: string;
  last_message_at: string;
  last_sender_id: string | null;
  my_last_read_at: string | null;
};

/**
 * Henter en lett oppsummering av brukerens samtaler og beregner antall uleste.
 * Lytter også til realtime-innsettinger i `messages` for å holde tellingen frisk.
 */
export function useUnreadConversationsCount(): number {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["unread-conversations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConvSummary[]> => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id, last_message_at, buyer_id, seller_id, buyer_last_read_at, seller_last_read_at")
        .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`);
      if (error) throw error;
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, sender_id, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });
      const lastSender = new Map<string, string>();
      for (const m of msgs ?? []) {
        if (!lastSender.has(m.conversation_id)) {
          lastSender.set(m.conversation_id, m.sender_id);
        }
      }
      return (convs ?? []).map((c) => ({
        id: c.id,
        last_message_at: c.last_message_at,
        last_sender_id: lastSender.get(c.id) ?? null,
        my_last_read_at: c.buyer_id === user!.id ? c.buyer_last_read_at : c.seller_last_read_at,
      }));
    },
  });

  // Realtime: refetch når nye meldinger kommer inn for denne brukeren
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  // Fallback: refresh når fanen får fokus igjen (i tilfelle realtime ikke leverer)
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ["unread-conversations"] });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // På native fungerer ikke focus/visibilitychange pålitelig i Capacitor WebView
    let removeAppStateListener: (() => void) | undefined;
    if (isNative()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) qc.invalidateQueries({ queryKey: ["unread-conversations"] });
        }).then((handle) => {
          removeAppStateListener = () => void handle.remove();
        });
      });
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      removeAppStateListener?.();
    };
  }, [user, qc]);

  const conversationUnread = (data ?? []).filter((c) =>
    isUnread(c.last_message_at, c.last_sender_id, user?.id, c.my_last_read_at),
  ).length;

  const { data: systemUnread } = useQuery({
    queryKey: ["system-messages-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("system_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  return conversationUnread + (systemUnread ?? 0);
}

/**
 * Lett antall-uleste for varselklokken (lagrede søk, prisfall, ønskes
 * kjøpt-treff) — samme tre tabeller som NotificationsBell viser, men uten
 * dens joins mot annonser/søk/wtb-annonser. Brukes til badgen på
 * bunnavigasjonens Meg-fane, som er den eneste inngangen til varsler i den
 * native informasjonsarkitekturen (se app-bottom-nav.tsx).
 */
export function useUnreadNotificationsCount(): number {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const countUnread = async (
        table: "saved_search_notifications" | "favorite_price_drops" | "wtb_match_notifications",
      ) => {
        const { count, error } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        if (error) return 0;
        return count ?? 0;
      };
      const [notifs, drops, wtbMatches] = await Promise.all([
        countUnread("saved_search_notifications"),
        countUnread("favorite_price_drops"),
        countUnread("wtb_match_notifications"),
      ]);
      return notifs + drops + wtbMatches;
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    const onFocus = () => qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
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

  return data ?? 0;
}
