import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { getFeaturedListings } from "@/lib/promotions.functions";

type Props = {
  categorySlug?: string;
  limit?: number;
  allowedIds?: Set<string>;
};

export function FeaturedListingsSection({ categorySlug, limit = 2, allowedIds }: Props) {
  const fetchFeatured = useServerFn(getFeaturedListings);
  const { data } = useQuery({
    queryKey: ["featured-listings", categorySlug ?? null, limit],
    queryFn: () => fetchFeatured({ data: { category_slug: categorySlug, limit } }),
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  const filtered = allowedIds ? data.filter((l) => allowedIds.has(l.id)) : data;
  if (filtered.length === 0) return null;

  const cards: ListingCardData[] = filtered.map((l) => ({
    id: l.id,
    title: l.title,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
  }));

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-2";

  return (
    <section className="mb-2">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3 text-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Promoterte annonser
        </span>
      </div>
      <div className={`grid gap-4 ${gridCols}`}>
        {cards.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}

export function getFeaturedIds(data: { id: string }[] | undefined): string[] {
  return (data ?? []).map((d) => d.id);
}
