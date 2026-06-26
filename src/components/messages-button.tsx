import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useIsNative } from "@/lib/use-is-native";
import { isUnread } from "@/lib/unread";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type ConvPreview = {
  id: string;
  listing_id: string | null;
  listing_title: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  buyer_last_read_at: string | null;
  seller_last_read_at: string | null;
  other_name: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
};

type RawProfile = { id: string; display_name: string; avatar_url: string | null };
type RawListing = { title: string };

async function fetchConversationPreviews(userId: string): Promise<ConvPreview[]> {
  // Try with FK alias joins first
  const { data: convs, error } = await supabase
    .from("conversations")
    .select(
      `id, buyer_id, seller_id, listing_id, last_message_at, buyer_last_read_at, seller_last_read_at,
       listing:listings(title),
       buyer:profiles!conversations_buyer_id_fkey(id, display_name, avatar_url),
       seller:profiles!conversations_seller_id_fkey(id, display_name, avatar_url)`,
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("last_message_at", { ascending: false })
    .limit(8);

  type RawConv = {
    id: string;
    buyer_id: string;
    seller_id: string;
    listing_id: string | null;
    last_message_at: string;
    buyer_last_read_at: string | null;
    seller_last_read_at: string | null;
    listing: RawListing | RawListing[] | null;
    buyer?: RawProfile | RawProfile[] | null;
    seller?: RawProfile | RawProfile[] | null;
  };

  let rows: RawConv[] = [];

  if (error) {
    // Fallback: fetch profiles separately
    const { data: simpleConvs, error: e2 } = await supabase
      .from("conversations")
      .select(
        `id, buyer_id, seller_id, listing_id, last_message_at, buyer_last_read_at, seller_last_read_at,
         listing:listings(title)`,
      )
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order("last_message_at", { ascending: false })
      .limit(8);
    if (e2) throw e2;
    const rawSimple = (simpleConvs ?? []) as unknown as RawConv[];
    const profileIds = Array.from(new Set(rawSimple.flatMap((c) => [c.buyer_id, c.seller_id])));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    rows = rawSimple.map((c) => ({
      ...c,
      buyer: pmap.get(c.buyer_id) ?? null,
      seller: pmap.get(c.seller_id) ?? null,
    }));
  } else {
    rows = (convs ?? []) as unknown as RawConv[];
  }

  if (rows.length === 0) return [];

  const ids = rows.map((c) => c.id);
  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, body, sender_id, created_at, deleted_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });

  const lastMsg = new Map<string, { body: string; sender_id: string }>();
  for (const m of msgs ?? []) {
    if (!lastMsg.has(m.conversation_id)) {
      lastMsg.set(m.conversation_id, {
        body: m.deleted_at ? "Melding slettet" : m.body,
        sender_id: m.sender_id,
      });
    }
  }

  return rows.map((c) => {
    const listing = Array.isArray(c.listing) ? c.listing[0] : c.listing;
    const buyer = Array.isArray(c.buyer) ? c.buyer[0] : c.buyer;
    const seller = Array.isArray(c.seller) ? c.seller[0] : c.seller;
    const other = userId === c.seller_id ? buyer : seller;
    const lm = lastMsg.get(c.id);
    return {
      id: c.id,
      listing_id: c.listing_id,
      listing_title: (listing as RawListing | null)?.title ?? null,
      buyer_id: c.buyer_id,
      seller_id: c.seller_id,
      last_message_at: c.last_message_at,
      buyer_last_read_at: c.buyer_last_read_at,
      seller_last_read_at: c.seller_last_read_at,
      other_name: (other as RawProfile | null)?.display_name ?? null,
      last_message_body: lm?.body ?? null,
      last_message_sender_id: lm?.sender_id ?? null,
    };
  });
}

export function MessagesButton() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const native = useIsNative();
  const [open, setOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["messages-preview", user?.id],
    enabled: !!user,
    queryFn: () => fetchConversationPreviews(user!.id),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`messages-preview:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void refetch();
        qc.invalidateQueries({ queryKey: ["unread-conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refetch, qc]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => qc.invalidateQueries({ queryKey: ["messages-preview"] });
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

  const conversations = data ?? [];
  const unreadCount = conversations.filter((c) => {
    const myLastReadAt = c.buyer_id === user.id ? c.buyer_last_read_at : c.seller_last_read_at;
    return isUnread(c.last_message_at, c.last_message_sender_id, user.id, myLastReadAt);
  }).length;

  const trigger = (
    <Button variant="ghost" size="icon" aria-label="Meldinger" className="relative">
      <MessageCircle className="size-5" />
      {unreadCount > 0 && (
        <span
          className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
          aria-label={`${unreadCount} uleste meldinger`}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  const convList = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Meldinger</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Ingen meldinger ennå.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const myLastReadAt =
                c.buyer_id === user.id ? c.buyer_last_read_at : c.seller_last_read_at;
              const unread = isUnread(
                c.last_message_at,
                c.last_message_sender_id,
                user.id,
                myLastReadAt,
              );
              const lastFromMe = c.last_message_sender_id === user.id;
              return (
                <li key={c.id} className={unread ? "bg-primary/5" : ""}>
                  <Link
                    to="/meldinger/$id"
                    params={{ id: c.id }}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 hover:bg-muted"
                  >
                    <div className="flex items-start gap-2">
                      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">
                          {c.other_name ?? "Ukjent bruker"}
                        </p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {c.listing_title && <span className="mr-1">{c.listing_title} ·</span>}
                          {c.last_message_body
                            ? `${lastFromMe ? "Du: " : ""}${c.last_message_body}`
                            : "Ingen meldinger enda"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.last_message_at), {
                          addSuffix: false,
                          locale: nb,
                        })}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-border">
        <Link
          to="/meldinger"
          onClick={() => setOpen(false)}
          className="block rounded px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Se alle meldinger
        </Link>
      </div>
    </>
  );

  if (native) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-8">
          <div className="mx-auto mb-1 mt-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="sr-only">
            <SheetTitle>Meldinger</SheetTitle>
          </SheetHeader>
          {convList}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        {convList}
      </PopoverContent>
    </Popover>
  );
}
