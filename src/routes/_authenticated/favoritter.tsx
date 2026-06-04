import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";

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

function FavoritesPage() {
  const { user } = useAuth();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ["user-favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select(
          "listing_id, created_at, listings!inner(id, title, price_nok, is_free, city, created_at, status, listing_images(storage_path, sort_order))",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row): ListingCardData | null => {
          const l = Array.isArray(row.listings) ? row.listings[0] : row.listings;
          if (!l) return null;
          const imgs = (l.listing_images ?? [])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order);
          return {
            id: l.id,
            title: l.title,
            price_nok: l.price_nok,
            is_free: l.is_free,
            city: l.city,
            created_at: l.created_at,
            cover_path: imgs[0]?.storage_path ?? null,
          };
        })
        .filter((x): x is ListingCardData => x !== null);
    },
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
            {(favorites ?? []).map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
