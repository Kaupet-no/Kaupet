import { useMemo } from "react";
import type { ListingCardData } from "@/components/listing-card";
import { signListingImageUrls, thumbPathFor } from "@/lib/storage";

/** Kort-thumbnail-URL per annonse. Eldre annonser mangler en faktisk
 * thumbnail-fil på denne stien — `ListingImage` sin `onError` faller da
 * tilbake til originalbildet (se `listing-card.tsx`). */
export function useListingCardImages(cards: ListingCardData[]): Record<string, string | null> {
  const coverKey = useMemo(() => cards.map((card) => card.cover_path ?? "").join("|"), [cards]);

  return useMemo(() => {
    const withCover = cards.filter((card) => card.cover_path);
    const thumbUrls = signListingImageUrls(withCover.map((card) => thumbPathFor(card.cover_path!)));
    return Object.fromEntries(
      withCover.map((card) => [card.id, thumbUrls[thumbPathFor(card.cover_path!)] ?? null]),
    );
    // coverKey deliberately represents the exact image workload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverKey]);
}
