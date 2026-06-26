import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Tag, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WtbListingWithProfile } from "@/lib/wtb-listings.functions";

type Props = {
  listing: WtbListingWithProfile;
};

export function WtbListingCard({ listing }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { mutate: contact, isPending } = useMutation({
    mutationFn: async () => {
      if (!user) {
        navigate({ to: "/auth", search: { mode: "signin" } });
        return null;
      }
      if (listing.user_id === user.id) return null;

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("wtb_listing_id", listing.id)
        .eq("buyer_id", listing.user_id)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (existing?.id) return existing.id;

      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          wtb_listing_id: listing.id,
          buyer_id: listing.user_id,
          seller_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return created.id;
    },
    onSuccess: (id) => {
      if (id) navigate({ to: "/meldinger/$id", params: { id } });
    },
    onError: () => showErrorToast("Kunne ikke starte samtale. Prøv igjen."),
  });

  const isOwn = user?.id === listing.user_id;
  const timeAgo = formatDistanceToNow(new Date(listing.created_at), {
    addSuffix: true,
    locale: nb,
  });

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-primary hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold leading-tight">{listing.title}</h3>
          {listing.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
          )}
        </div>
        {listing.max_price_nok != null && (
          <div className="shrink-0 text-right">
            <span className="text-xs text-muted-foreground">Maks</span>
            <p className="font-semibold text-primary">
              {listing.max_price_nok.toLocaleString("nb-NO")} kr
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {listing.categories && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Tag className="size-3" />
            {listing.categories.name_nb}
          </Badge>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="size-3" />
          {timeAgo}
        </span>
        {listing.profiles?.display_name && (
          <span className="text-xs text-muted-foreground">· {listing.profiles.display_name}</span>
        )}
      </div>

      {!isOwn && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2"
          onClick={() => contact()}
          disabled={isPending}
        >
          <MessageSquare className="size-4" />
          Ta kontakt
        </Button>
      )}
      {isOwn && <p className="text-center text-xs text-muted-foreground">Dette er din annonse</p>}
    </article>
  );
}
