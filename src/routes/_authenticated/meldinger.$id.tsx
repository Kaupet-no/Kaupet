import { createFileRoute, Link } from "@tanstack/react-router";
import type { ConvSummary } from "@/lib/use-unread";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, User as UserIcon } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BlockConversationMenu } from "@/components/block-conversation-menu";
import { listMyBlocks, listBlocksAgainstMe } from "@/lib/blocks.functions";
import { confirmBuyer, getSaleForListing, unconfirmBuyer } from "@/lib/sales.functions";
import { createReview, getMyReviewForListing } from "@/lib/reviews.functions";
import { formatErrorMessage } from "@/lib/errors";
import { useIsNative } from "@/lib/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { useKeyboardVisible } from "@/lib/use-keyboard-visible";
import { ConversationErrorBoundary } from "@/components/meldinger/conversation-error-boundary";
import { renderWithDayDividers, type Message } from "@/components/meldinger/message-list";
import { SalePanel } from "@/components/meldinger/sale-panel";

export const Route = createFileRoute("/_authenticated/meldinger/$id")({
  head: () => ({
    meta: [{ title: "Samtale — Kaupet.no" }],
  }),
  component: ConversationPage,
  errorComponent: ConversationErrorBoundary,
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

function ConversationPage() {
  const native = useIsNative();
  const keyboardVisible = useKeyboardVisible();
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
          `id, buyer_id, seller_id, listing_id, buyer_last_read_at, seller_last_read_at,
           listing:listings(id, kaupet_code, title, price_nok, is_free, listing_images(storage_path, sort_order))`,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Samtalen finnes ikke");
      const rawListing = (data as { listing: unknown }).listing;
      const listing = Array.isArray(rawListing) ? rawListing[0] : rawListing;
      const otherId = user!.id === data.seller_id ? data.buyer_id : data.seller_id;
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
        .select("id, conversation_id, sender_id, body, created_at, deleted_at")
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
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
    const path = imgs[0]?.storage_path;
    if (path) {
      signListingImageUrls([path]).then((urls) => setCoverUrl(urls[path] ?? null));
    }
  }, [conv?.listing?.id, conv?.listing?.listing_images]);

  // Markér samtalen som lest i databasen for innlogget bruker
  const markReadMutation = useMutation({
    mutationFn: async (readAt: string) => {
      if (!conv || !user) return;
      const update =
        conv.buyer_id === user.id
          ? { buyer_last_read_at: readAt }
          : { seller_last_read_at: readAt };
      const { error } = await supabase.from("conversations").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Oppdater cachen direkte for å unngå race condition mot INSERT-refetch
      queryClient.setQueryData<ConvSummary[]>(
        ["unread-conversations", user?.id],
        (prev) =>
          prev?.map((c) =>
            c.id === id ? { ...c, my_last_read_at: new Date().toISOString() } : c,
          ) ?? prev,
      );
      queryClient.invalidateQueries({ queryKey: ["unread-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
    },
  });

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
          markReadMutation.mutate(m.created_at);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as {
            buyer_last_read_at: string | null;
            seller_last_read_at: string | null;
          };
          queryClient.setQueryData<typeof conv>(["conversation", id], (prev) =>
            prev
              ? {
                  ...prev,
                  buyer_last_read_at: updated.buyer_last_read_at,
                  seller_last_read_at: updated.seller_last_read_at,
                }
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryClient, conv, user]);

  // Auto-scroll + markér som lest når meldinger lastes/oppdateres
  useEffect(() => {
    if (scrollRef.current) {
      // Utsett scroll til etter DOM-paint (viktig på Capacitor WebView)
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    if (messages && messages.length > 0 && conv && user) {
      markReadMutation.mutate(messages[messages.length - 1].created_at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, id, conv, user]);

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
        .select("id, conversation_id, sender_id, body, created_at, deleted_at")
        .single();
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ last_message_at: data.created_at })
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

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw error;
      return messageId;
    },
    onSuccess: (messageId) => {
      queryClient.setQueryData<Message[]>(["messages", id], (prev) =>
        prev?.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m)),
      );
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette meldingen")),
  });

  const priceLabel = conv?.listing?.is_free
    ? "Gis bort"
    : conv?.listing?.price_nok != null
      ? `${conv.listing.price_nok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  const otherId = conv ? (conv.buyer_id === user?.id ? conv.seller_id : conv.buyer_id) : null;
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
      showSuccessToast("Kjøper bekreftet");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke bekrefte kjøper")),
  });

  const unconfirmMutation = useMutation({
    mutationFn: () => unconfirmBuyerFn({ data: { listingId: listingId! } }),
    onSuccess: () => {
      showSuccessToast("Salget er angret");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke angre salget")),
  });

  const iBlockedAll = !!(
    otherId && myBlocks?.some((b) => b.scope === "all" && b.blocked_id === otherId)
  );
  const iBlockedConv = !!myBlocks?.some(
    (b) => b.scope === "conversation" && b.conversation_id === id,
  );
  const iBlocked = iBlockedAll || iBlockedConv;
  const theyBlockedMe = !!(
    otherId &&
    blocksAgainstMe?.some(
      (b) => b.blocker_id === otherId && (b.scope === "all" || b.conversation_id === id),
    )
  );
  const disabled = !!conv?.otherDeleted || !!conv?.otherPending || iBlocked || theyBlockedMe;
  const disabledPlaceholder =
    conv?.otherDeleted || conv?.otherPending
      ? "Du kan ikke svare denne brukeren"
      : iBlocked
        ? "Du har blokkert denne samtalen"
        : theyBlockedMe
          ? "Du kan ikke sende meldinger i denne samtalen"
          : "Skriv en melding…";

  return (
    <div
      className="mx-auto flex max-w-3xl flex-col"
      style={{
        height: native
          ? keyboardVisible
            ? "var(--vvh, 100vh)"
            : "calc(100vh - var(--app-bottom-nav-h))"
          : "calc(100vh - 4rem)",
      }}
    >
      <NativePageHeader title={conv?.listing?.title ?? "Samtale"} backTo="/meldinger" />
      <div
        className="flex flex-1 flex-col overflow-hidden px-4"
        style={{
          paddingTop: "1rem",
          paddingBottom: native && keyboardVisible ? 0 : "1rem",
        }}
      >
        {!native && (
          <Link
            to="/meldinger"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Alle meldinger
          </Link>
        )}

        {conv && !(native && keyboardVisible) && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {coverUrl && <img src={coverUrl} alt="" className="size-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              {conv.listing ? (
                <Link
                  to="/$kaupetCode"
                  params={{ kaupetCode: (conv.listing as { kaupet_code: string }).kaupet_code }}
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

        {conv && !(native && keyboardVisible) && (
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
              showSuccessToast("Takk for vurderingen!");
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
              {conv?.other?.display_name
                ? `Send den første meldingen til ${conv.other.display_name}${conv.listing?.title ? ` om «${conv.listing.title}»` : ""}.`
                : "Send den første meldingen for å starte samtalen."}
            </p>
          ) : (
            renderWithDayDividers(
              messages ?? [],
              user?.id ?? "",
              (messageId) => deleteMessageMutation.mutate(messageId),
              conv && user
                ? conv.buyer_id === user.id
                  ? conv.seller_last_read_at
                  : conv.buyer_last_read_at
                : null,
            )
          )}
        </div>

        <form
          className="mt-3 flex items-stretch gap-2"
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
            className="h-auto gap-2 self-stretch"
          >
            <Send className="size-4" /> Send
          </Button>
        </form>
        {sendMutation.error && (
          <p className="mt-2 text-xs text-destructive">{(sendMutation.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
