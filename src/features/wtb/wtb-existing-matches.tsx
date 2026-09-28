import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { formatPrice } from "@/lib/format";

export function WtbExistingMatchesBanner({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm"
    >
      <Search className="size-4 shrink-0 text-brand-text" aria-hidden />
      {count === 1
        ? "1 annonse til salgs matcher allerede det du leter etter."
        : `${count} annonser til salgs matcher allerede det du leter etter.`}
    </p>
  );
}

export function WtbExistingMatchesList({
  count,
  listings,
}: {
  count: number;
  listings: { id: string; title: string; price_nok: number | null; is_free: boolean }[];
}) {
  if (listings.length === 0) return null;
  return (
    <section className="w-full space-y-2 text-left">
      <h2 className="text-sm font-medium text-muted-foreground">
        {count === 1 ? "1 annonse matcher allerede" : `${count} annonser matcher allerede`}
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {listings.map((l) => (
          <li key={l.id}>
            <Link
              to="/annonse/$listingId"
              params={{ listingId: l.id }}
              className="native-touch-target flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="line-clamp-1 flex-1">{l.title}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatPrice({ price_nok: l.price_nok, is_free: l.is_free })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
