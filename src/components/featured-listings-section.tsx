import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { getFeaturedListings } from "@/lib/promotions.functions";

type Props = {
  categorySlug?: string;
  limit?: number;
};

export function FeaturedListingsSection({ categorySlug, limit = 2 }: Props) {
  const fetchFeatured = useServerFn(getFeaturedListings);
  const { data } = useQuery({
    queryKey: ["featured-listings", categorySlug ?? null, limit],
    queryFn: () => fetchFeatured({ data: { category_slug: categorySlug, limit } }),
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  const cards: ListingCardData[] = data.map((l) => ({
    id: l.id,
    title: l.title,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
  }));

  return (
    <section className="mb-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
          Fremhevet
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        {cards.map((l) => (
          <div key={l.id} className="relative">
            <ListingCard listing={l} />
            <span className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground shadow">
              <Sparkles className="size-3" /> Fremhevet
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function getFeaturedIds(data: { id: string }[] | undefined): string[] {
  return (data ?? []).map((d) => d.id);
}
