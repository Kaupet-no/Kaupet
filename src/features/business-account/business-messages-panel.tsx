import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MessageCircle } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";

type Props = { organization: BusinessOrganization; locationId: string | "all" };

type Listing = {
  id: string;
  title: string;
  listing_images: { storage_path: string; sort_order: number }[];
};

type Conversation = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  last_message_at: string;
  listing: Listing | Listing[] | null;
};

type BusinessConversation = Omit<Conversation, "listing"> & {
  listing: Listing | null;
  buyer: Profile | null;
  latest: Message | null;
};

type Message = { conversation_id: string; body: string; created_at: string; sender_id: string };
type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  deleted_at: string | null;
};

export function BusinessMessagesPanel({ organization, locationId }: Props) {
  const conversationsQuery = useQuery({
    queryKey: ["business-messages", organization.id, locationId],
    staleTime: 30_000,
    queryFn: async (): Promise<BusinessConversation[]> => {
      let query = supabase
        .from("conversations")
        .select(
          "id, buyer_id, seller_id, listing_id, last_message_at, listing:listings!inner(id, title, organization_id, organization_location_id, listing_images(storage_path, sort_order))",
        )
        .eq("listing.organization_id", organization.id);
      if (locationId !== "all") query = query.eq("listing.organization_location_id", locationId);
      const { data, error } = await query.order("last_message_at", { ascending: false });
      if (error) throw error;
      const conversations = (data ?? []) as unknown as Conversation[];
      const ids = conversations.map((conversation) => conversation.id);
      const userIds = Array.from(
        new Set(
          conversations.flatMap((conversation) => [conversation.buyer_id, conversation.seller_id]),
        ),
      );
      const [{ data: messages, error: messagesError }, { data: profiles, error: profilesError }] =
        await Promise.all([
          ids.length
            ? supabase
                .from("messages")
                .select("conversation_id, body, created_at, sender_id")
                .in("conversation_id", ids)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          userIds.length
            ? supabase
                .from("profiles")
                .select("id, display_name, avatar_url, deleted_at")
                .in("id", userIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
      if (messagesError) throw messagesError;
      if (profilesError) throw profilesError;
      const latestByConversation = new Map<string, Message>();
      for (const message of (messages ?? []) as Message[]) {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, message);
        }
      }
      const profileById = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile as Profile]),
      );
      return conversations.map((conversation) => ({
        ...conversation,
        listing: Array.isArray(conversation.listing)
          ? (conversation.listing[0] ?? null)
          : conversation.listing,
        buyer: profileById.get(conversation.buyer_id) ?? null,
        latest: latestByConversation.get(conversation.id) ?? null,
      }));
    },
  });
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = (conversationsQuery.data ?? [])
      .map((conversation) => {
        const listing = conversation.listing;
        return listing?.listing_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.storage_path;
      })
      .filter((path): path is string => !!path);
    let cancelled = false;
    signListingImageUrls(paths)
      .then((urls) => {
        if (!cancelled) setImageUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setImageUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, [conversationsQuery.data]);

  const conversations = conversationsQuery.data ?? [];

  return (
    <section aria-labelledby="business-messages-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 id="business-messages-title" className="font-display text-3xl tracking-tight">
            Meldinger
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Samtaler knyttet til bedriftens annonser. Svar som deg selv i den eksisterende
            meldingsflaten.
          </p>
        </div>
        {!conversationsQuery.isLoading &&
          !conversationsQuery.isError &&
          conversations.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {conversations.length} {conversations.length === 1 ? "samtale" : "samtaler"}
            </p>
          )}
      </div>
      {conversationsQuery.isLoading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Laster meldinger…</span>
          <div
            className="overflow-hidden rounded-xl border border-border bg-card"
            aria-hidden="true"
          >
            <ul className="divide-y divide-border">
              {Array.from({ length: 3 }, (_, index) => (
                <li key={index} className="flex min-h-24 items-center gap-3 p-4 sm:gap-4 sm:p-5">
                  <Skeleton className="size-14 shrink-0 rounded-lg" />
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : conversationsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Kunne ikke laste bedriftens meldinger. Prøv igjen senere.
          </AlertDescription>
        </Alert>
      ) : conversations.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {conversations.map((conversation) => {
              const listing = conversation.listing;
              const buyer = conversation.buyer;
              const latest = conversation.latest;
              const coverPath = listing?.listing_images
                ?.slice()
                .sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path;
              const coverUrl = coverPath ? imageUrls[coverPath] : undefined;
              return (
                <li key={conversation.id}>
                  <Link
                    to="/meldinger/$id"
                    params={{ id: conversation.id }}
                    search={{ source: "business" }}
                    className="group flex min-h-24 items-center gap-3 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:gap-4 sm:p-5"
                  >
                    <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {coverUrl ? (
                        <img src={coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <MessageCircle className="m-4 size-6 text-muted-foreground" />
                      )}
                    </span>
                    {buyer?.avatar_url ? (
                      <img
                        src={buyer.avatar_url}
                        alt=""
                        className="size-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <MessageCircle className="size-5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {buyer?.deleted_at
                          ? "Slettet bruker"
                          : (buyer?.display_name ?? "Ukjent kjøper")}
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {listing?.title ?? "Slettet annonse"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {latest?.body ?? "Ingen meldinger enda"}
                      </span>
                    </span>
                    <time
                      className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                      dateTime={conversation.last_message_at}
                    >
                      {new Intl.DateTimeFormat("nb-NO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(conversation.last_message_at))}
                    </time>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="Ingen samtaler enda"
          description="Meldinger om bedriftens annonser vises her."
          className="p-8 sm:p-10"
        />
      )}
    </section>
  );
}
