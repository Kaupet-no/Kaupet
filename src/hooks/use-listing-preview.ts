import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";

export type ListingPreviewData = {
  title: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  cover_path: string | null;
  kaupet_code: string | null;
};

/**
 * Shared "small preview card" data for a listing by id — used by the promote
 * and just-published dialogs, which show the same title/price/city/cover
 * summary right after a listing action. Also resolves the cover path to a
 * signed URL, the same effect both dialogs previously duplicated.
 */
export function useListingPreview(listingId: string, enabled: boolean) {
  const { data: listing } = useQuery({
    queryKey: ["listing-preview", listingId],
    enabled,
    queryFn: async (): Promise<ListingPreviewData | null> => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "title, price_nok, is_free, city, kaupet_code, listing_images(storage_path, sort_order)",
        )
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const cover =
        (data.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.storage_path ?? null;
      return {
        title: data.title,
        price_nok: data.price_nok,
        is_free: data.is_free,
        city: data.city,
        cover_path: cover,
        kaupet_code: data.kaupet_code,
      };
    },
  });

  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const path = listing?.cover_path;
    if (!path) return;
    let cancelled = false;
    signListingImageUrls([path]).then((m) => {
      if (!cancelled) setSignedUrls((prev) => ({ ...prev, [path]: m[path] ?? null }));
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.cover_path]);
  const imgUrl = listing?.cover_path ? (signedUrls[listing.cover_path] ?? null) : null;

  return { listing, imgUrl };
}
