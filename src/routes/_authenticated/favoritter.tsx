import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ["user-favorites", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FavoriteRow[]> => {
      const { data, error } = await supabase
        .from("favorites")
        .select(
          "listing_id, created_at, listings(id, title, price_nok, is_free, city, created_at, status, listing_images(storage_path, sort_order))",
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
        const imgs = (l.listing_images ?? [])
          .slice()
          .sort(
            (a: { sort_order: number }, b: { sort_order: number }) =>
              a.sort_order - b.sort_order,
          );
        return {
          kind: "available",
          listing_id: row.listing_id,
          card: {
            id: l.id,
            title: l.title,
            price_nok: l.price_nok,
            is_free: l.is_free,
            city: l.city,
            created_at: l.created_at,
            cover_path: imgs[0]?.storage_path ?? null,
          },
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
      toast.success("Fjernet fra favoritter");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3">
        <Heart className="size-6 text-accent" />
        <h1 className="font-display text-3xl tracking-tight">Mine favoritter</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Annonser du har lagret for senere.
      </p>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (favorites ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-lg font-medium">Du har ikke lagret noen favoritter ennå</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Trykk på hjertet på en annonse for å lagre den her.
            </p>
            <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
              <Button className="mt-6">Utforsk annonser</Button>
            </Link>
          </div>
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
  );
}
