import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, ChevronDown, ChevronRight, BellRing, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { isUnread, useReadVersion } from "@/lib/unread";
import { usePushStatus } from "@/lib/use-push-status";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/meldinger/")({
  head: () => ({
    meta: [
      { title: "Meldinger — Kaupet.no" },
      { name: "description", content: "Dine samtaler med kjøpere og selgere." },
    ],
  }),
  component: InboxPage,
});

type ConversationRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  last_message_at: string;
  listing: {
    id: string;
    title: string;
    price_nok: number | null;
    is_free: boolean;
    status: string;
    listing_images: { storage_path: string; sort_order: number }[];
  } | null;
  buyer: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    deleted_at: string | null;
  } | null;
  seller: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    deleted_at: string | null;
  } | null;
  last_message: { body: string; created_at: string; sender_id: string } | null;
};

function InboxPage() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["my-conversations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, seller_id, listing_id, last_message_at,
           listing:listings(id, title, price_nok, is_free, status, listing_images(storage_path, sort_order)),
           buyer:profiles!conversations_buyer_id_fkey(id, display_name, avatar_url, deleted_at),
           seller:profiles!conversations_seller_id_fkey(id, display_name, avatar_url, deleted_at)`,
        )
        .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
        .order("last_message_at", { ascending: false });
      if (error) {
        // Fall back if FK alias join fails: fetch profiles separately
        const { data: convs, error: e2 } = await supabase
          .from("conversations")
          .select(
            `id, buyer_id, seller_id, listing_id, last_message_at,
             listing:listings(id, title, price_nok, is_free, status, listing_images(storage_path, sort_order))`,
          )
          .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
          .order("last_message_at", { ascending: false });
        if (e2) throw e2;
        const ids = Array.from(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new Set((convs ?? []).flatMap((c: any) => [c.buyer_id, c.seller_id])),
        );
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, deleted_at")
          .in("id", ids);
        const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = (convs ?? []).map((c: any) => ({
          ...c,
          listing: Array.isArray(c.listing) ? c.listing[0] : c.listing,
          buyer: pmap.get(c.buyer_id) ?? null,
          seller: pmap.get(c.seller_id) ?? null,
        }));
        return await attachLastMessage(enriched);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalised = (data ?? []).map((c: any) => ({
        ...c,
        listing: Array.isArray(c.listing) ? c.listing[0] : c.listing,
        buyer: Array.isArray(c.buyer) ? c.buyer[0] : c.buyer,
        seller: Array.isArray(c.seller) ? c.seller[0] : c.seller,
      }));
      return await attachLastMessage(normalised);
    },
  });

  // Last opp signerte bilde-URLer for omslagsbilder
  useEffect(() => {
    if (!conversations) return;
    const paths = conversations
      .map((c) => {
        const imgs = (c.listing?.listing_images ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order);
        return imgs[0]?.storage_path;
      })
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      signListingImageUrls(paths).then((urls) => setImgUrls((prev) => ({ ...prev, ...urls })));
    }
  }, [conversations]);

  const readVersion = useReadVersion();

  // Beregn uleste per samtale
  const unreadByConv = useMemo(() => {
    void readVersion;
    const m = new Map<string, boolean>();
    for (const c of conversations ?? []) {
      m.set(c.id, isUnread(c.id, c.last_message_at, c.last_message?.sender_id, user?.id));
    }
    return m;
  }, [conversations, readVersion, user?.id]);

  // Grupper etter annonse
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        listing: ConversationRow["listing"];
        conversations: ConversationRow[];
        lastActivity: string;
        unreadCount: number;
      }
    >();
    for (const c of conversations ?? []) {
      const key = c.listing_id;
      const u = unreadByConv.get(c.id) ? 1 : 0;
      const g = map.get(key);
      if (g) {
        g.conversations.push(c);
        g.unreadCount += u;
        if (c.last_message_at > g.lastActivity) g.lastActivity = c.last_message_at;
      } else {
        map.set(key, {
          listing: c.listing,
          conversations: [c],
          lastActivity: c.last_message_at,
          unreadCount: u,
        });
      }
    }
    return Array.from(map.entries())
      .map(([listingId, g]) => ({ listingId, ...g }))
      .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  }, [conversations, unreadByConv]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center gap-3">
        <MessageCircle className="size-6 text-accent" />
        <h1 className="font-display text-3xl tracking-tight">Meldinger</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Samtalene dine er gruppert etter annonse.
      </p>

      <PushHintForMessages />

      <div className="mt-8 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-lg font-medium">Ingen samtaler enda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Når du eller noen andre starter en samtale om en annonse, dukker den opp her.
            </p>
            <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
              <Button className="mt-6">Utforsk annonser</Button>
            </Link>
          </div>
        ) : (
          groups.map((g) => {
            const isExpanded = expanded[g.listingId] ?? true;
            const cover = (g.listing?.listing_images ?? [])
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)[0];
            const coverUrl = cover ? imgUrls[cover.storage_path] : undefined;
            const priceLabel = g.listing?.is_free
              ? "Gis bort"
              : g.listing?.price_nok != null
                ? `${g.listing.price_nok.toLocaleString("nb-NO")} kr`
                : "Pris ved henvendelse";
            return (
              <div
                key={g.listingId}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [g.listingId]: !isExpanded }))}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.listing?.title ?? "Slettet annonse"}</p>
                    <p className="text-xs text-muted-foreground">
                      {priceLabel} · {g.conversations.length}{" "}
                      {g.conversations.length === 1 ? "samtale" : "samtaler"}
                    </p>
                  </div>
                  {g.unreadCount > 0 && (
                    <span
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground"
                      aria-label={`${g.unreadCount} uleste`}
                    >
                      {g.unreadCount}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(g.lastActivity)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <ul className="divide-y divide-border border-t border-border">
                    {g.conversations
                      .slice()
                      .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
                      .map((c) => {
                        const other = user?.id === c.seller_id ? c.buyer : c.seller;
                        const lastFromMe = c.last_message?.sender_id === user?.id;
                        const unread = unreadByConv.get(c.id) ?? false;
                        return (
                          <li key={c.id}>
                            <Link
                              to="/meldinger/$id"
                              params={{ id: c.id }}
                              className={`flex items-center gap-3 p-3 hover:bg-muted/40 ${unread ? "bg-accent/5" : ""}`}
                            >
                              {other?.avatar_url ? (
                                <img
                                  src={other.avatar_url}
                                  alt=""
                                  className="size-9 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                  {(other?.deleted_at ? "S" : (other?.display_name ?? "?"))
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"} ${other?.deleted_at ? "italic text-muted-foreground" : ""}`}
                                >
                                  {other?.deleted_at
                                    ? "Slettet bruker"
                                    : (other?.display_name ?? "Ukjent bruker")}
                                </p>
                                <p
                                  className={`truncate text-xs ${unread ? "text-foreground" : "text-muted-foreground"}`}
                                >
                                  {c.last_message
                                    ? `${lastFromMe ? "Du: " : ""}${c.last_message.body}`
                                    : "Ingen meldinger enda"}
                                </p>
                              </div>
                              {unread && (
                                <span
                                  className="size-2 shrink-0 rounded-full bg-accent"
                                  aria-label="Ulest"
                                />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatRelative(c.last_message_at)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const PUSH_HINT_DISMISS_KEY = "kaupet_push_msg_hint_dismissed_v1";

function PushHintForMessages() {
  const push = usePushStatus();
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(PUSH_HINT_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (push.loading || push.messagesActive || dismissed) return null;
  // Hide silently when the env doesn't support push (e.g. an embedded iframe)
  if (!push.supported) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await push.enableOnThisDevice("messages");
      toast.success("Push-varsler er aktivert på denne enheten");
    } catch (e) {
      toast.error(formatErrorMessage(e, "Klarte ikke å aktivere varsler"));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(PUSH_HINT_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="mt-6 flex gap-3 rounded-xl border border-border bg-card p-4">
      <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex-1 space-y-2 text-sm">
        {push.permission === "denied" ? (
          <>
            <p className="font-medium">Push-varsler er blokkert</p>
            <p className="text-muted-foreground">
              Du har blokkert varsler for kaupet.no. Endre tillatelsen i nettleserinnstillingene for
              å få varsel om nye meldinger.
            </p>
          </>
        ) : !push.subscribedHere ? (
          <>
            <p className="font-medium">Få varsel om nye meldinger</p>
            <p className="text-muted-foreground">
              Push-varsler er ikke aktivert på denne enheten. Du vil ikke få varsel når Kaupet.no er
              lukket.
            </p>
            <Button size="sm" onClick={enable} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Aktiver push-varsler
            </Button>
          </>
        ) : (
          <>
            <p className="font-medium">Push-varsler for meldinger er av</p>
            <p className="text-muted-foreground">
              Slå på for å få varsel om nye meldinger på denne enheten.
            </p>
            <Button size="sm" onClick={enable} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Slå på for meldinger
            </Button>
          </>
        )}
        <p>
          <Link
            to="/profil"
            search={{ tab: "varslinger" } as never}
            className="text-xs underline underline-offset-2 text-muted-foreground"
          >
            Administrer varsler
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label="Skjul melding"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

async function attachLastMessage(convs: ConversationRow[]): Promise<ConversationRow[]> {
  if (convs.length === 0) return convs;
  const ids = convs.map((c) => c.id);
  const { data } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at, sender_id")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  const lastByConv = new Map<string, { body: string; created_at: string; sender_id: string }>();
  for (const m of data ?? []) {
    if (!lastByConv.has(m.conversation_id)) {
      lastByConv.set(m.conversation_id, {
        body: m.body,
        created_at: m.created_at,
        sender_id: m.sender_id,
      });
    }
  }
  return convs.map((c) => ({ ...c, last_message: lastByConv.get(c.id) ?? null }));
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "nå";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} t`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}
