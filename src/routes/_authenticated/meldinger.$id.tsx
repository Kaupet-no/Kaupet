import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Send, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { markRead } from "@/lib/unread";
import { Textarea } from "@/components/ui/textarea";
import { BlockConversationMenu } from "@/components/block-conversation-menu";
import { listMyBlocks, listBlocksAgainstMe } from "@/lib/blocks.functions";
import { StarRating } from "@/components/star-rating";
import { confirmBuyer, getSaleForListing, unconfirmBuyer } from "@/lib/sales.functions";
import { createReview, getMyReviewForListing } from "@/lib/reviews.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatErrorMessage } from "@/lib/errors";

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
  const listMyBlocksFn = useServerFn(listMyBlocks);
  const listBlocksAgainstMeFn = useServerFn(listBlocksAgainstMe);
  const getSaleFn = useServerFn(getSaleForListing);
  const confirmBuyerFn = useServerFn(confirmBuyer);
  const unconfirmBuyerFn = useServerFn(unconfirmBuyer);
  const getMyReviewFn = useServerFn(getMyReviewForListing);
  const createReviewFn = useServerFn(createReview);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const { data: myBlocks } = useQuery({
    queryKey: ["my-blocks"],
    enabled: !!user,
    queryFn: () => listMyBlocksFn(),
  });
  const { data: blocksAgainstMe } = useQuery({
    queryKey: ["blocks-against-me"],
    enabled: !!user,
    queryFn: () => listBlocksAgainstMeFn(),
  });

  const { data: conv } = useQuery({
    queryKey: ["conversation", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, seller_id, listing_id,
           listing:listings(id, title, price_nok, is_free, listing_images(storage_path, sort_order))`,
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
        .select("id, display_name, avatar_url, deleted_at")
        .eq("id", otherId)
        .maybeSingle();
      const { data: pendingFlag } = await supabase.rpc("is_user_deletion_pending", {
        _user_id: otherId,
      });
      const otherDeleted = !!profile?.deleted_at;
      const otherPending = !!pendingFlag;
      return {
        ...data,
        listing,
        other: profile,
        otherDeleted,
        otherPending,
      };
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

  // Auto-scroll + markér som lest når meldinger lastes/oppdateres
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (messages && messages.length > 0) {
      markRead(id, messages[messages.length - 1].created_at);
    }
  }, [messages, id]);

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
      void import("@/lib/haptics").then((m) => m.hapticSelection());
      setBody("");
    },
  });

  const priceLabel = conv?.listing?.is_free
    ? "Gis bort"
    : conv?.listing?.price_nok != null
      ? `${conv.listing.price_nok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  const otherId = conv
    ? conv.buyer_id === user?.id
      ? conv.seller_id
      : conv.buyer_id
    : null;
  const isSeller = !!(conv && user && conv.seller_id === user.id);
  const listingId = conv?.listing_id ?? null;

  const { data: sale, refetch: refetchSale } = useQuery({
    queryKey: ["listing-sale", listingId],
    enabled: !!listingId,
    queryFn: () => getSaleFn({ data: { listingId: listingId! } }),
  });

  const saleIsForThisConversation = !!(sale && sale.conversation_id === id);
  const saleConfirmedForOtherBuyer = !!(sale && !saleIsForThisConversation);
  const iAmInSale = !!(sale && user && (sale.buyer_id === user.id || sale.seller_id === user.id));

  const { data: myReview, refetch: refetchMyReview } = useQuery({
    queryKey: ["my-review", listingId],
    enabled: !!listingId && iAmInSale,
    queryFn: () => getMyReviewFn({ data: { listingId: listingId! } }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmBuyerFn({ data: { conversationId: id } }),
    onSuccess: () => {
      toast.success("Kjøper bekreftet");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke bekrefte kjøper")),
  });

  const unconfirmMutation = useMutation({
    mutationFn: () =>
      unconfirmBuyerFn({ data: { listingId: listingId! } }),
    onSuccess: () => {
      toast.success("Salget er angret");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke angre salget")),
  });

  const iBlockedAll = !!(otherId && myBlocks?.some(
    (b) => b.scope === "all" && b.blocked_id === otherId,
  ));
  const iBlockedConv = !!myBlocks?.some(
    (b) => b.scope === "conversation" && b.conversation_id === id,
  );
  const iBlocked = iBlockedAll || iBlockedConv;
  const theyBlockedMe = !!(otherId && blocksAgainstMe?.some(
    (b) =>
      b.blocker_id === otherId &&
      (b.scope === "all" || b.conversation_id === id),
  ));
  const disabled =
    !!conv?.otherDeleted || !!conv?.otherPending || iBlocked || theyBlockedMe;
  const disabledPlaceholder = conv?.otherDeleted || conv?.otherPending
    ? "Du kan ikke svare denne brukeren"
    : iBlocked
      ? "Du har blokkert denne samtalen"
      : theyBlockedMe
        ? "Du kan ikke sende meldinger i denne samtalen"
        : "Skriv en melding…";

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
            {conv.listing ? (
              <Link
                to="/annonse/$id"
                params={{ id: conv.listing_id }}
                className="block truncate font-medium hover:underline"
              >
                {conv.listing.title}
              </Link>
            ) : (
              <p className="block truncate font-medium italic text-muted-foreground">
                Annonsen er ikke lenger tilgjengelig
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {priceLabel} · med{" "}
              {conv.otherDeleted || !otherId ? (
                <span>{conv.otherDeleted ? "Slettet bruker" : "ukjent bruker"}</span>
              ) : (
                <Link
                  to="/bruker/$id"
                  params={{ id: otherId }}
                  className="underline-offset-2 hover:underline"
                >
                  {conv.other?.display_name ?? "ukjent bruker"}
                </Link>
              )}
            </p>
          </div>
          {otherId && !conv.otherDeleted ? (
            <Link
              to="/bruker/$id"
              params={{ id: otherId }}
              aria-label={`Se profilen til ${conv.other?.display_name ?? "denne brukeren"}`}
            >
              {conv.other?.avatar_url ? (
                <img
                  src={conv.other.avatar_url}
                  alt=""
                  className="size-9 rounded-full object-cover ring-offset-2 transition hover:ring-2 hover:ring-primary"
                />
              ) : (
                <div className="flex size-9 items-center justify-center rounded-full bg-muted transition hover:ring-2 hover:ring-primary">
                  <UserIcon className="size-4 text-muted-foreground" />
                </div>
              )}
            </Link>
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <UserIcon className="size-4 text-muted-foreground" />
            </div>
          )}
          {otherId && !conv.otherDeleted && !theyBlockedMe && (
            <BlockConversationMenu
              targetUserId={otherId}
              conversationId={id}
              targetName={conv.other?.display_name ?? "denne brukeren"}
            />
          )}
        </div>
      )}

      {conv && (
        <SalePanel
          isSeller={isSeller}
          sale={sale ?? null}
          saleIsForThisConversation={saleIsForThisConversation}
          saleConfirmedForOtherBuyer={saleConfirmedForOtherBuyer}
          iAmInSale={iAmInSale}
          otherName={conv.other?.display_name ?? "denne brukeren"}
          otherDeleted={!!conv.otherDeleted}
          myReview={myReview ?? null}
          onConfirm={() => confirmMutation.mutate()}
          onUnconfirm={() => unconfirmMutation.mutate()}
          confirming={confirmMutation.isPending}
          unconfirming={unconfirmMutation.isPending}
          onSubmitReview={async (rating, comment) => {
            await createReviewFn({ data: { listingId: listingId!, rating, comment } });
            toast.success("Takk for vurderingen!");
            refetchMyReview();
          }}
        />
      )}

      {conv && (conv.otherDeleted || conv.otherPending) && (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {conv.otherDeleted
            ? "Denne brukeren har slettet kontoen sin. Du kan ikke lenger sende meldinger i denne samtalen."
            : "Denne brukeren har bedt om å få slettet kontoen sin. Du kan ikke sende nye meldinger."}
        </div>
      )}

      {conv && iBlocked && (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {iBlockedAll
            ? `Du har blokkert ${conv.other?.display_name ?? "denne brukeren"}. Du kan oppheve blokkeringen øverst eller fra profilen din.`
            : "Du har blokkert denne samtalen. Du kan oppheve blokkeringen øverst eller fra profilen din."}
        </div>
      )}

      {conv && theyBlockedMe && !iBlocked && (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Du kan ikke sende meldinger i denne samtalen.
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
          if (!sendMutation.isPending && !disabled) sendMutation.mutate(body);
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!sendMutation.isPending && !disabled) {
                sendMutation.mutate(body);
              }
            }
          }}
          placeholder={disabledPlaceholder}
          rows={2}
          maxLength={4000}
          disabled={disabled}
          className="min-h-[60px] flex-1 resize-none"
        />
        <Button
          type="submit"
          disabled={sendMutation.isPending || !body.trim() || disabled}
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

type SalePanelProps = {
  isSeller: boolean;
  sale: { listing_id: string; buyer_id: string; seller_id: string; conversation_id: string } | null;
  saleIsForThisConversation: boolean;
  saleConfirmedForOtherBuyer: boolean;
  iAmInSale: boolean;
  otherName: string;
  otherDeleted: boolean;
  myReview: { id: string; rating: number; comment: string | null } | null;
  onConfirm: () => void;
  onUnconfirm: () => void;
  confirming: boolean;
  unconfirming: boolean;
  onSubmitReview: (rating: number, comment: string) => Promise<void>;
};

function SalePanel(props: SalePanelProps) {
  const {
    isSeller,
    sale,
    saleIsForThisConversation,
    saleConfirmedForOtherBuyer,
    iAmInSale,
    otherName,
    otherDeleted,
    myReview,
    onConfirm,
    onUnconfirm,
    confirming,
    unconfirming,
    onSubmitReview,
  } = props;

  if (otherDeleted) return null;

  // No sale yet
  if (!sale) {
    if (!isSeller) return null;
    return (
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">Solgte du gjenstanden til {otherName}?</p>
          <p className="text-xs text-muted-foreground">
            Marker som solgt for å låse annonsen og åpne for vurdering av kjøperen.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="gap-2" disabled={confirming}>
              {confirming && <Loader2 className="size-4 animate-spin" />}
              <CheckCircle2 className="size-4" /> Marker som solgt
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bekreft kjøper</AlertDialogTitle>
              <AlertDialogDescription>
                {`Marker ${otherName} som kjøper av denne annonsen? Annonsen settes til «solgt» og kan ikke vises som aktiv igjen før salget eventuelt angres.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>Bekreft</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Sale exists but is for a different conversation/buyer
  if (saleConfirmedForOtherBuyer) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Denne annonsen er allerede markert som solgt til en annen kjøper.
      </div>
    );
  }

  // Sale is for this conversation
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-primary" />
          {isSeller
            ? `Solgt til ${otherName}`
            : `Du er bekreftet som kjøper av denne annonsen`}
        </p>
        {isSeller && !myReview && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnconfirm}
            disabled={unconfirming}
            className="text-xs"
          >
            {unconfirming && <Loader2 className="size-3 animate-spin" />}
            Angre salg
          </Button>
        )}
      </div>

      {iAmInSale && (
        <ReviewForm myReview={myReview} otherName={otherName} onSubmit={onSubmitReview} />
      )}
    </div>
  );
}

function ReviewForm({
  myReview,
  otherName,
  onSubmit,
}: {
  myReview: { rating: number; comment: string | null } | null;
  otherName: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(myReview?.rating ?? 0);
  const [comment, setComment] = useState(myReview?.comment ?? "");
  const [submitting, setSubmitting] = useState(false);

  if (myReview) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Din vurdering</p>
        <div className="mt-1 flex items-center gap-2">
          <StarRating value={myReview.rating} readOnly size={18} />
          <span className="text-sm font-medium">{myReview.rating} / 5</span>
        </div>
        {myReview.comment && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{myReview.comment}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Vurderinger er endelige og kan ikke endres etter publisering.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Velg minst én stjerne");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(rating, comment.trim());
    } catch (err) {
      toast.error(formatErrorMessage(err, "Kunne ikke sende vurderingen"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-medium">Gi {otherName} en vurdering</p>
        <p className="text-xs text-muted-foreground">
          1–5 stjerner og en kort kommentar (valgfri). Vurderingen er endelig.
        </p>
      </div>
      <StarRating value={rating} onChange={setRating} size={28} />
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Kort kommentar (valgfri)"
        rows={3}
        maxLength={500}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={submitting || rating < 1} className="gap-2">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Publiser vurdering
        </Button>
      </div>
    </form>
  );
}
