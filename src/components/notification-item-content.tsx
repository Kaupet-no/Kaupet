import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { CircleCheck, ShoppingBag, TrendingDown } from "lucide-react";

import { formatNok } from "@/lib/format";
import type { NotificationItem } from "@/lib/notifications";
import { savedSearchLabel } from "@/lib/saved-searches";

/** Tittel- og detaljlinje for et varsel — delt av NotificationsBell og /varsler. */
export function NotificationItemContent({ n }: { n: NotificationItem }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-1 text-sm font-medium">
        {n.kind === "price_drop" && <TrendingDown className="mr-1 inline size-3.5 text-brand" />}
        {n.kind === "sold" && <CircleCheck className="mr-1 inline size-3.5 text-brand" />}
        {n.kind === "wtb_match" && <ShoppingBag className="mr-1 inline size-3.5 text-brand" />}
        {n.listing_title ??
          (n.kind === "price_drop" || n.kind === "sold" ? "Favoritten din" : "Ny annonse")}
      </p>
      <p className="line-clamp-1 text-xs text-muted-foreground">
        {n.kind === "search" ? (
          <>Treff i «{n.search_name ? savedSearchLabel(n.search_name) : "Lagret søk"}»</>
        ) : n.kind === "wtb_match" ? (
          <>Treff på «{n.wtb_title ?? "Ønskes kjøpt"}»</>
        ) : n.kind === "sold" ? (
          <>Favoritten din er solgt</>
        ) : (
          <>
            Prisfall −{Number(n.drop_pct).toFixed(0)} % · {formatNok(n.old_price_nok)} →{" "}
            {formatNok(n.new_price_nok)}
          </>
        )}{" "}
        · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: nb })}
      </p>
    </div>
  );
}
