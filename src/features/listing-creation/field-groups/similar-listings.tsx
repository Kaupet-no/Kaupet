import { displayPriceNok, formatPrice } from "@/lib/format";
import type { WizardSharedProps } from "./types";

/** "Lignende annonser" list — identical block reused verbatim on web step 2 and native step 2. */
export function SimilarListings({ similarListings }: Pick<WizardSharedProps, "similarListings">) {
  if (!similarListings || similarListings.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Lignende annonser</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {similarListings.map((l) => (
          <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="line-clamp-1 flex-1 text-foreground">{l.title}</span>
            <span className="ml-3 shrink-0 text-muted-foreground">
              {formatPrice({ price_nok: displayPriceNok(l), is_free: l.is_free })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
