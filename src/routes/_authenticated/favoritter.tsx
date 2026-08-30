import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsNative } from "@/hooks/use-is-native";
import { Heart, X } from "lucide-react";

import { NativePageHeader } from "@/components/native-page-header";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatErrorMessage } from "@/lib/errors";
import { toListingCardData } from "@/lib/listing-card-data";

export const Route = createFileRoute("/_authenticated/favoritter")({
  head: () => ({
    meta: [
      { title: "Mine favoritter — Kaupet.no" },
      { name: "description", content: "Annonser du har lagret som favoritt." },
    ],
  }),
  component: FavoritesPage,
});

type FavoriteRow =
  | { kind: "available"; listing_id: string; card: ListingCardData }
  | { kind: "unavailable"; listing_id: string; reason: "deleted" | "archived" };

function FavoritesPage() {
  const native = useIsNative();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: native,
    onRefresh: () => queryClient.resetQueries({ queryKey: ["user-favorites"] }),
  });

  const { data: favorites, isLoading } = useQuery({
    queryKey: ["user-favorites", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FavoriteRow[]> => {
      const { data, error } = await supabase
        .from("favorites")
        .select(
          "listing_id, created_at, listings(id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, status, listing_images(storage_path, sort_order), attributes, categories(slug))",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row): FavoriteRow => {
        const l = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        if (!l) {
          return { kind: "unavailable", listing_id: row.listing_id, reason: "deleted" };
        }
        if (l.status !== "active") {
          return { kind: "unavailable", listing_id: row.listing_id, reason: "archived" };
        }
        return {
          kind: "available",
          listing_id: row.listing_id,
          card: toListingCardData(l),
        };
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user!.id)
        .eq("listing_id", listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-favorites", user?.id] });
      showSuccessToast("Fjernet fra favoritter");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke fjerne favoritten")),
  });

  return (
    <>
      <NativePageHeader title="Mine favoritter" backLabel="Meg" backTo="/meg" />
      {native && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {!native && (
          <div className="flex items-center gap-3 max-sm:hidden">
            <Heart className="size-6 text-brand" />
            <h1 className="font-display text-3xl tracking-tight">Mine favoritter</h1>
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">Annonser du har lagret for senere.</p>

        <div className="mt-8">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3]" />
              ))}
            </div>
          ) : (favorites ?? []).length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Du har ikke lagret noen favoritter ennå"
              description="Trykk på hjertet på en annonse for å lagre den her."
              action={
                <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
                  <Button>Utforsk annonser</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {(favorites ?? []).map((row) =>
                row.kind === "available" ? (
                  <ListingCard key={row.listing_id} listing={row.card} />
                ) : (
                  <div
                    key={row.listing_id}
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center"
                  >
                    <p className="text-sm font-medium">
                      {row.reason === "deleted"
                        ? "Annonsen er slettet"
                        : "Annonsen er ikke lenger tilgjengelig"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(row.listing_id)}
                    >
                      <X className="size-4" /> Fjern fra favoritter
                    </Button>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
