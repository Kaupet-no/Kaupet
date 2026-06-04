import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, User as UserIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { markRead } from "@/lib/unread";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/meldinger/$id")({
  head: () => ({
    meta: [{ title: "Samtale — Kaupet.no" }],
  }),
  component: ConversationPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Kunne ikke laste samtalen</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          className="mt-6"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Prøv på nytt
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Samtalen finnes ikke</h1>
      <Link to="/meldinger">
        <Button className="mt-6" variant="outline">
          Tilbake til meldinger
        </Button>
      </Link>
    </div>
  ),
});

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function ConversationPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const { data: conv } = useQuery({
    queryKey: ["conversation", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, seller_id, listing_id,
           listing:listings!inner(id, title, price_nok, is_free, listing_images(storage_path, sort_order))`,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Samtalen finnes ikke");
      const listing = Array.isArray((data as any).listing)
        ? (data as any).listing[0]
        : (data as any).listing;
      const otherId =
        user!.id === data.seller_id ? data.buyer_id : data.seller_id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      return { ...data, listing, other: profile };
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", id],
    enabled: !!user,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Bilde av annonsen
  useEffect(() => {
    const imgs = (conv?.listing?.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order);
    const path = imgs[0]?.storage_path;
    if (path) {
      signListingImageUrls([path]).then((urls) =>
        setCoverUrl(urls[path] ?? null),
      );
    }
  }, [conv?.listing?.id]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          queryClient.setQueryData<Message[]>(["messages", id], (prev) => {
            if (!prev) return [m];
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          // Markér som lest når brukeren er inne i samtalen
          markRead(id, m.created_at);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Tom melding");
      if (trimmed.length > 4000) throw new Error("Meldingen er for lang");
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: id,
          sender_id: user!.id,
          body: trimmed,
        })
        .select("id, conversation_id, sender_id, body, created_at")
        .single();
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", id);
      return data as Message;
    },
    onSuccess: (m) => {
      queryClient.setQueryData<Message[]>(["messages", id], (prev) => {
        if (!prev) return [m];
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
      setBody("");
    },
  });

  const priceLabel = conv?.listing?.is_free
    ? "Gis bort"
    : conv?.listing?.price_nok != null
      ? `${conv.listing.price_nok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-4">
      <Link
        to="/meldinger"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Alle meldinger
      </Link>

      {conv && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            {coverUrl && (
              <img src={coverUrl} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to="/annonse/$id"
              params={{ id: conv.listing_id }}
              className="block truncate font-medium hover:underline"
            >
              {conv.listing?.title ?? "Annonse"}
            </Link>
            <p className="text-xs text-muted-foreground">
              {priceLabel} · med {conv.other?.display_name ?? "ukjent bruker"}
            </p>
          </div>
          {conv.other?.avatar_url ? (
            <img
              src={conv.other.avatar_url}
              alt=""
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <UserIcon className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-4"
      >
        {(messages ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Send den første meldingen for å starte samtalen.
          </p>
        ) : (
          renderWithDayDividers(messages ?? [], user?.id ?? "")
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sendMutation.isPending) sendMutation.mutate(body);
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!sendMutation.isPending) sendMutation.mutate(body);
            }
          }}
          placeholder="Skriv en melding…"
          rows={2}
          maxLength={4000}
          className="min-h-[60px] flex-1 resize-none"
        />
        <Button
          type="submit"
          disabled={sendMutation.isPending || !body.trim()}
          className="gap-2"
        >
          <Send className="size-4" /> Send
        </Button>
      </form>
      {sendMutation.error && (
        <p className="mt-2 text-xs text-destructive">
          {(sendMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

function renderWithDayDividers(messages: Message[], myId: string) {
  const out: React.ReactElement[] = [];
  let lastDay = "";
  for (const m of messages) {
    const d = new Date(m.created_at);
    const day = d.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (day !== lastDay) {
      out.push(
        <div
          key={`d-${m.id}`}
          className="my-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          {day}
        </div>,
      );
      lastDay = day;
    }
    const mine = m.sender_id === myId;
    out.push(
      <div
        key={m.id}
        className={`flex ${mine ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
            mine
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
          <p
            className={`mt-1 text-[10px] ${
              mine ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {d.toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>,
    );
  }
  return out;
}
