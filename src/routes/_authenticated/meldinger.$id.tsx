import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import type { ConvSummary } from "@/hooks/use-unread";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Paperclip, Send, User as UserIcon, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  signListingImageUrls,
  signMessageAttachmentUrls,
  uploadMessageAttachment,
  validateImages,
  describeImageError,
} from "@/lib/storage";
import { compressImage } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BlockConversationMenu } from "@/components/block-conversation-menu";
import { listMyBlocks, listBlocksAgainstMe } from "@/lib/blocks.functions";
import { confirmBuyer, getSaleForListing, unconfirmBuyer } from "@/lib/sales.functions";
import { createReview, getMyReviewForListing } from "@/lib/reviews.functions";
import { formatErrorMessage } from "@/lib/errors";
import { useIsNative } from "@/hooks/use-is-native";
import { useFormFactor } from "@/hooks/use-form-factor";
import { InboxPage } from "@/components/inbox-page";
import { NativePageHeader } from "@/components/native-page-header";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";
import { ConversationErrorBoundary } from "@/components/meldinger/conversation-error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { renderWithDayDividers, type Message } from "@/components/meldinger/message-list";
import { SalePanel } from "@/components/meldinger/sale-panel";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";
import { TradeSafetyAdvice } from "@/components/trade-safety-advice";

export const Route = createFileRoute("/_authenticated/meldinger/$id")({
  head: () => ({
    meta: [{ title: "Samtale — Kaupet.no" }],
  }),
  validateSearch: z.object({ source: z.literal("business").optional() }),
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
  const { data: businessMembership } = useBusinessMembership();
  const isBusinessSuperuser =
    businessMembership?.status === "active" &&
    (businessMembership.role === "superuser" ||
      businessMembership.locations.some((location) => location.permissions.chatAccess === "all"));
  const native = useIsNative();
  const isTablet = useFormFactor() === "tablet";
  const keyboardVisible = useKeyboardVisible();
  const { id } = Route.useParams();
  const { source } = Route.useSearch();
  const { user } = useAuth();
  const userId = user?.id;
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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const {
    data: conv,
    isLoading: convLoading,
    isError: convIsError,
    error: convError,
  } = useQuery({
    queryKey: ["conversation", id, isBusinessSuperuser],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, seller_id, listing_id, buyer_last_read_at, seller_last_read_at,
           listing:listings(id, organization_id, kaupet_code, title, price_nok, is_free, listing_images(storage_path, sort_order))`,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Samtalen finnes ikke");
      const rawListing = data.listing;
      const listing = Array.isArray(rawListing) ? rawListing[0] : rawListing;
      const listingOrganizationId =
        listing &&
        typeof listing === "object" &&
        "organization_id" in listing &&
        typeof listing.organization_id === "string"
          ? listing.organization_id
          : null;
      const isBusinessSeller =
        isBusinessSuperuser && businessMembership?.organization.id === listingOrganizationId;
      const viewerIsSeller = user!.id === data.seller_id || isBusinessSeller;
      const otherId = viewerIsSeller ? data.buyer_id : data.seller_id;
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
        isBusinessSeller,
        other: profile,
        otherDeleted,
        otherPending,
      };
    },
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", id],
    enabled: !!user,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, deleted_at, attachment_path")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Signerte URL-er for meldingsvedlegg (privat bucket, samme mønster som annonsebilder).
  useEffect(() => {
    const paths = (messages ?? [])
      .map((m) => m.attachment_path)
      .filter((p): p is string => !!p && !attachmentUrls[p]);
    if (paths.length === 0) return;
    signMessageAttachmentUrls(paths).then((urls) =>
      setAttachmentUrls((prev) => ({ ...prev, ...urls })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

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

  // Markér samtalen som lest i databasen for innlogget bruker.
  // lastMarkedRef hindrer at samme (eller eldre) tidsstempel skrives på nytt
  // for hver realtime-INSERT eller cache-oppdatering.
  const lastMarkedRef = useRef<string | null>(null);
  // Nullstill guarden når man navigerer til en annen samtale, ellers kan et
  // nyere tidsstempel fra forrige samtale blokkere lest-markering av denne.
  useEffect(() => {
    lastMarkedRef.current = null;
  }, [id]);
  const markReadMutation = useMutation({
    mutationFn: async (readAt: string) => {
      if (!conv || !user) return;
      if (lastMarkedRef.current && readAt <= lastMarkedRef.current) return;
      lastMarkedRef.current = readAt;
      const update =
        conv.seller_id === user.id || conv.isBusinessSeller
          ? { seller_last_read_at: readAt }
          : { buyer_last_read_at: readAt };
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
      queryClient.invalidateQueries({ queryKey: ["messages-preview"] });
    },
    onError: (e: Error) => {
      lastMarkedRef.current = null;
      showErrorToast(formatErrorMessage(e, "Kunne ikke markere samtalen som lest"));
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
  }, [id, queryClient, userId]);

  // Auto-scroll + markér som lest når meldinger lastes/oppdateres
  useEffect(() => {
    if (scrollRef.current) {
      // Utsett scroll til etter DOM-paint (viktig på Capacitor WebView)
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    if (messages && conv && user) {
      const readAt =
        messages.length > 0 ? messages[messages.length - 1].created_at : new Date().toISOString();
      markReadMutation.mutate(readAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, id, conv, user]);

  const sendMutation = useMutation({
    mutationFn: async ({ text, file }: { text: string; file: File | null }) => {
      const trimmed = text.trim();
      if (!trimmed && !file) throw new Error("Tom melding");
      if (trimmed.length > 4000) throw new Error("Meldingen er for lang");
      let attachmentPath: string | null = null;
      if (file) {
        const compressed = await compressImage(file, "listing");
        attachmentPath = await uploadMessageAttachment({ conversationId: id, file: compressed });
      }
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: id,
          sender_id: user!.id,
          body: trimmed,
          attachment_path: attachmentPath,
        })
        .select("id, conversation_id, sender_id, body, created_at, deleted_at, attachment_path")
        .single();
      if (error) throw error;
      // conversations.last_message_at oppdateres nå atomisk av en
      // databasetrigger (messages_bump_conversation_last_message_at_trg)
      // for å unngå at feltet kan drifte fra faktisk siste melding.
      return data as Message;
    },
    // Optimistisk: vis meldingen og tøm feltet umiddelbart; rull tilbake ved feil.
    onMutate: ({ text, file }: { text: string; file: File | null }) => {
      const trimmed = text.trim();
      if ((!trimmed && !file) || trimmed.length > 4000) return {};
      const previewUrl = file ? URL.createObjectURL(file) : undefined;
      const optimistic: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        conversation_id: id,
        sender_id: user!.id,
        body: trimmed,
        created_at: new Date().toISOString(),
        deleted_at: null,
        pending: true,
        attachmentPreviewUrl: previewUrl,
      };
      queryClient.setQueryData<Message[]>(["messages", id], (prev) =>
        prev ? [...prev, optimistic] : [optimistic],
      );
      setBody("");
      clearAttachment();
      return { optimisticId: optimistic.id, previousBody: text, previewUrl };
    },
    onSuccess: (m, _vars, context) => {
      queryClient.setQueryData<Message[]>(["messages", id], (prev) => {
        const withoutOptimistic = (prev ?? []).filter((x) => x.id !== context?.optimisticId);
        if (withoutOptimistic.some((x) => x.id === m.id)) return withoutOptimistic;
        return [...withoutOptimistic, m];
      });
      if (context?.previewUrl) URL.revokeObjectURL(context.previewUrl);
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
      void import("@/lib/haptics").then((m) => m.hapticSelection());
    },
    onError: (e: Error, _vars, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<Message[]>(["messages", id], (prev) =>
          prev?.filter((x) => x.id !== context.optimisticId),
        );
        setBody((curr) => (curr.trim() ? curr : (context.previousBody ?? "")));
      }
      if (context?.previewUrl) URL.revokeObjectURL(context.previewUrl);
      showErrorToast(formatErrorMessage(e, "Meldingen ble ikke sendt. Prøv igjen."));
    },
  });

  function clearAttachment() {
    setAttachment(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAttachmentChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImages([file]);
    if (err) {
      showErrorToast(describeImageError(err));
      e.target.value = "";
      return;
    }
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
  }

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
  const isBusinessSeller = !!conv?.isBusinessSeller;
  const otherId = conv
    ? conv.seller_id === user?.id || isBusinessSeller
      ? conv.buyer_id
      : conv.seller_id
    : null;
  const isSeller = !!(conv && user && (conv.seller_id === user.id || isBusinessSeller));
  const personalSellerControlsDisabled = isBusinessSeller && conv?.seller_id !== user?.id;
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

  if (convIsError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Samtalen finnes ikke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatErrorMessage(convError, "Kunne ikke laste samtalen.")}
        </p>
        <Link to="/meldinger">
          <Button className="mt-6" variant="outline">
            Tilbake til meldinger
          </Button>
        </Link>
      </div>
    );
  }

  const thread = (
    <div
      className="mx-auto flex max-w-2xl flex-col"
      style={{
        height: native
          ? keyboardVisible
            ? "var(--vvh, 100vh)"
            : "calc(100vh - var(--app-bottom-nav-h))"
          : "calc(100vh - 4rem)",
      }}
    >
      <NativePageHeader
        title={conv?.listing?.title ?? "Samtale"}
        backTo={source === "business" ? "/bedrift" : "/meldinger"}
        hideBack={isTablet}
      />
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

        {convLoading && !(native && keyboardVisible) && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </div>
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
                  <span>{conv.otherDeleted ? "Slettet bruker" : "Ukjent bruker"}</span>
                ) : (
                  <Link
                    to="/bruker/$id"
                    params={{ id: otherId }}
                    className="underline-offset-2 hover:underline"
                  >
                    {conv.other?.display_name ?? "Ukjent bruker"}
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
            {otherId && !conv.otherDeleted && !theyBlockedMe && !personalSellerControlsDisabled && (
              <BlockConversationMenu
                targetUserId={otherId}
                conversationId={id}
                targetName={conv.other?.display_name ?? "denne brukeren"}
              />
            )}
          </div>
        )}

        {conv && !(native && keyboardVisible) && !personalSellerControlsDisabled && (
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
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-4"
        >
          {messagesLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          ) : (messages ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
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
              attachmentUrls,
            )
          )}
          {!messagesLoading && (
            <TradeSafetyAdvice context="conversation" messageCount={messages?.length ?? 0} />
          )}
        </div>

        {attachmentPreview && !personalSellerControlsDisabled && (
          <div className="relative mt-2 w-fit">
            <img
              src={attachmentPreview}
              alt="Vedlegg som skal sendes"
              className="max-h-24 rounded-lg border border-border object-contain"
            />
            <button
              type="button"
              aria-label="Fjern vedlegg"
              onClick={clearAttachment}
              className="absolute -right-2 -top-2 rounded-full bg-foreground/80 p-1 text-background"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <form
          className="mt-3 flex items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !sendMutation.isPending &&
              !disabled &&
              (body.trim() || (!personalSellerControlsDisabled && attachment))
            )
              sendMutation.mutate({
                text: body,
                file: personalSellerControlsDisabled ? null : attachment,
              });
          }}
        >
          {!personalSellerControlsDisabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAttachmentChange}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Legg ved bilde"
                disabled={disabled || !!attachment}
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 self-end"
              >
                <Paperclip className="size-4" />
              </Button>
            </>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Enter-for-å-sende er en tastatursnarvei for fysisk tastatur
              // (desktop/web), der Shift+Enter gir linjeskift. Native
              // mobiltastaturer har ingen pålitelig Shift-tilstand å skille
              // på, og retur-tasten er brukerens eneste måte å skrive en
              // flerlinjers melding på - der skal Enter derfor gi linjeskift
              // som normalt, og Send-knappen sender.
              if (native) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (
                  !sendMutation.isPending &&
                  !disabled &&
                  (body.trim() || (!personalSellerControlsDisabled && attachment))
                ) {
                  sendMutation.mutate({
                    text: body,
                    file: personalSellerControlsDisabled ? null : attachment,
                  });
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
            disabled={
              sendMutation.isPending ||
              (!body.trim() && (personalSellerControlsDisabled || !attachment)) ||
              disabled
            }
            className="h-auto gap-2 self-stretch"
          >
            <Send className="size-4" /> Send
          </Button>
        </form>
      </div>
    </div>
  );

  // Nettbrett (fase 10 / tiltak 22): liste + tråd side om side. Begge er
  // eksisterende komponenter — dette er et layoutgrep, ikke ny meldingslogikk.
  if (!isTablet) return thread;
  return (
    <div className="flex">
      <aside
        className="w-80 shrink-0 overflow-y-auto border-r border-border"
        style={{ height: keyboardVisible ? "var(--vvh, 100vh)" : "100vh" }}
      >
        <InboxPage />
      </aside>
      <div className="min-w-0 flex-1">{thread}</div>
    </div>
  );
}
