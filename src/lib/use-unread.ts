import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isUnread, useReadVersion } from "@/lib/unread";

type ConvSummary = {
  id: string;
  last_message_at: string;
  last_sender_id: string | null;
};

/**
 * Henter en lett oppsummering av brukerens samtaler og beregner antall uleste.
 * Lytter også til realtime-innsettinger i `messages` for å holde tellingen frisk.
 */
export function useUnreadConversationsCount(): number {
  const { user } = useAuth();
  const readVersion = useReadVersion();

  const { data, refetch } = useQuery({
    queryKey: ["unread-conversations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConvSummary[]> => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id, last_message_at")
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
      }));
    },
  });

  // Realtime: refetch når nye meldinger kommer inn for denne brukeren
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetch]);

  // readVersion brukes for å re-evaluere isUnread når noe markeres som lest
  void readVersion;

  return (data ?? []).filter((c) =>
    isUnread(c.id, c.last_message_at, c.last_sender_id, user?.id),
  ).length;
}
