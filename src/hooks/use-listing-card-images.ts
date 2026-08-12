import { useEffect, useMemo, useState } from "react";
import type { ListingCardData } from "@/components/listing-card";
import { signListingImageUrls, thumbPathFor } from "@/lib/storage";

/** Signs an entire result page in at most two storage calls (thumbs, then
 * legacy originals), instead of one or two calls per card. */
export function useListingCardImages(cards: ListingCardData[]): Record<string, string | null> {
  const coverKey = useMemo(() => cards.map((card) => card.cover_path ?? "").join("|"), [cards]);
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const withCover = cards.filter((card) => card.cover_path);
    if (withCover.length === 0) return;
    let cancelled = false;
    void (async () => {
      const thumbPaths = withCover.map((card) => thumbPathFor(card.cover_path!));
      const thumbs = await signListingImageUrls(thumbPaths);
      const missing = withCover.filter((card) => !thumbs[thumbPathFor(card.cover_path!)]);
      const originals = missing.length
        ? await signListingImageUrls(missing.map((card) => card.cover_path!))
        : {};
      if (cancelled) return;
      setUrls(
        Object.fromEntries(
          withCover.map((card) => [
            card.id,
            thumbs[thumbPathFor(card.cover_path!)] ?? originals[card.cover_path!] ?? null,
          ]),
        ),
      );
    })().catch(() => {
      if (!cancelled) setUrls({});
    });
    return () => {
      cancelled = true;
    };
    // coverKey deliberately represents the exact image workload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverKey]);

  return urls;
}
