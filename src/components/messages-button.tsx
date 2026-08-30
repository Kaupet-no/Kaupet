import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MessageCircle, MessagesSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative } from "@/hooks/use-is-native";
import { useUnreadConversationsCount } from "@/hooks/use-unread";
import { isUnread } from "@/lib/unread";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSheet } from "@/components/ui/native-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

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

  let rows: RawConv[];

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

export function MessagesButton({ isActive }: { isActive?: boolean } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const native = useIsNative();
  const [open, setOpen] = useState(false);

  const { data, refetch, isLoading, isError, isFetching } = useQuery({
    queryKey: ["messages-preview", user?.id],
    enabled: !!user,
    queryFn: () => fetchConversationPreviews(user!.id),
    refetchInterval: 60_000,
  });

  const userId = user?.id;
  useEffect(() => {
    // Depend on the id, not the `user` object — AuthProvider gives it a new
    // reference on every auth event (e.g. TOKEN_REFRESHED), which would
    // otherwise tear down and resubscribe this Realtime channel throughout
    // the session even though the logged-in user hasn't actually changed.
    if (!userId) return;
    const ch = supabase
      .channel(`messages-preview:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void refetch();
        qc.invalidateQueries({ queryKey: ["unread-conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refetch, qc]);

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

  // Delt med SiteHeader (MessagesIconLink) slik at uleste-tallet er likt på
  // tvers av desktop-header og mobil-bunnav — se useUnreadConversationsCount.
  const unreadCount = useUnreadConversationsCount();

  if (!user) return null;

  const conversations = data ?? [];

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={unreadCount > 0 ? `Meldinger, ${unreadCount} uleste` : "Meldinger"}
      aria-current={isActive ? "page" : undefined}
      className="native-touch-target relative"
    >
      <MessageCircle className="size-5" />
      {unreadCount > 0 && (
        <span
          className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-brand-foreground"
          aria-hidden="true"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  const convList = (
    <>
      {!native && (
        <div className="border-b border-border px-3 py-2 text-sm font-medium">Meldinger</div>
      )}
      <div className={native ? "min-h-0 flex-1 overflow-y-auto" : "max-h-[400px] overflow-y-auto"}>
        {isLoading ? (
          <div className="space-y-3 px-4 py-4" aria-label="Laster meldinger">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={MessagesSquare}
            title="Kunne ikke laste meldinger"
            description="Prøv igjen om et øyeblikk."
            action={<Button onClick={() => void refetch()}>Prøv igjen</Button>}
            className="m-4 p-6"
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Ingen meldinger ennå"
            description="Samtalene dine vises her."
            className="m-4 p-6"
          />
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
                    className={
                      native
                        ? "block min-h-16 px-4 py-3 hover:bg-muted"
                        : "block min-h-12 px-3 py-2.5 hover:bg-muted"
                    }
                  >
                    {unread && <span className="sr-only">Ulest. </span>}
                    <div
                      className={
                        native
                          ? "flex flex-wrap items-start gap-x-2 gap-y-1"
                          : "flex items-start gap-2"
                      }
                    >
                      {unread && (
                        <span
                          className="mt-2 size-2 shrink-0 rounded-full bg-brand"
                          aria-hidden="true"
                        />
                      )}
                      <div className={native ? "min-w-0 basis-48 flex-1" : "min-w-0 flex-1"}>
                        <p
                          className={
                            native ? "text-base font-medium" : "line-clamp-1 text-sm font-medium"
                          }
                        >
                          {c.other_name ?? "Ukjent bruker"}
                        </p>
                        <p
                          className={
                            native
                              ? "line-clamp-2 text-sm text-muted-foreground"
                              : "line-clamp-1 text-xs text-muted-foreground"
                          }
                        >
                          {c.listing_title && <span className="mr-1">{c.listing_title} ·</span>}
                          {c.last_message_body
                            ? `${lastFromMe ? "Du: " : ""}${c.last_message_body}`
                            : "Ingen meldinger enda"}
                        </p>
                      </div>
                      <span
                        className={
                          native
                            ? "text-sm text-muted-foreground"
                            : "shrink-0 text-xs text-muted-foreground"
                        }
                      >
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
      {isFetching && !isLoading && (
        <div role="status" aria-live="polite" className="sr-only">
          Oppdaterer meldinger
        </div>
      )}
      <div className={native ? "mt-4 border-t border-border px-4 pt-3" : "border-t border-border"}>
        <Link
          to="/meldinger"
          onClick={() => setOpen(false)}
          className={
            native
              ? "flex h-14 items-center justify-center rounded-md text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              : "flex min-h-12 items-center justify-center rounded px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          Se alle meldinger
        </Link>
      </div>
    </>
  );

  if (native) {
    return (
      <NativeSheet
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title={<span className="block px-4 pb-3 pt-4">Meldinger</span>}
        titleVisible
        expandable
        initialSnapPoint={0.6}
        className="flex flex-col p-0 pb-safe"
      >
        {convList}
      </NativeSheet>
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
