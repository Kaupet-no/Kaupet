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

export function FeaturedListingsSection({ categorySlug, limit = 3, allowedIds }: Props) {
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
    kaupet_code: l.kaupet_code,
    title: l.title,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
  }));

  return (
    <section className="mb-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Sparkles className="size-3 text-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Promoterte annonser
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {cards.map((l, i) => (
            <div key={l.id} className={i >= 2 ? "hidden sm:block" : undefined}>
              <ListingCard listing={l} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function getFeaturedIds(data: { id: string }[] | undefined): string[] {
  return (data ?? []).map((d) => d.id);
}
