import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, MessageCircle } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";

type Props = { organization: BusinessOrganization };

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

export function BusinessMessagesPanel({ organization }: Props) {
  const conversationsQuery = useQuery({
    queryKey: ["business-messages", organization.id],
    queryFn: async (): Promise<BusinessConversation[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, buyer_id, seller_id, listing_id, last_message_at, listing:listings!inner(id, title, organization_id, listing_images(storage_path, sort_order))",
        )
        .eq("listing.organization_id", organization.id)
        .order("last_message_at", { ascending: false });
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

  return (
    <section aria-labelledby="business-messages-title" className="space-y-5">
      <div>
        <h2 id="business-messages-title" className="font-display text-2xl tracking-tight">
          Meldinger
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Samtaler knyttet til bedriftens annonser. Svar som deg selv i den eksisterende
          meldingsflaten.
        </p>
      </div>
      {conversationsQuery.isLoading ? (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" /> Laster meldinger…
        </div>
      ) : conversationsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Kunne ikke laste bedriftens meldinger. Prøv igjen senere.
          </AlertDescription>
        </Alert>
      ) : conversationsQuery.data?.length ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {conversationsQuery.data.map((conversation) => {
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
                      className="flex min-h-20 items-center gap-3 p-4 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <MessageCircle className="m-3 size-6 text-muted-foreground" />
                        )}
                      </span>
                      {buyer?.avatar_url ? (
                        <img
                          src={buyer.avatar_url}
                          alt=""
                          className="size-10 rounded-full object-cover"
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
                        <span className="block truncate text-xs text-muted-foreground">
                          {listing?.title ?? "Slettet annonse"}
                          {latest ? ` · ${latest.body}` : " · Ingen meldinger enda"}
                        </span>
                      </span>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={conversation.last_message_at}
                      >
                        {new Intl.DateTimeFormat("nb-NO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(conversation.last_message_at))}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="Ingen samtaler enda"
          description="Meldinger om bedriftens annonser vises her."
        />
      )}
    </section>
  );
}
