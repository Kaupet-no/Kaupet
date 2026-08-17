import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";

export type ListingGalleryImage = {
  storage_path: string;
  sort_order: number;
  caption: string | null;
};

/** Full image list for one listing, fetched only when `enabled` (the card is
 * scrolled into view) — search results only carry `cover_path`, so kort-view
 * needs its own per-listing fetch instead of loading every gallery upfront. */
export function useListingGalleryImages(listingId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ["listing-gallery-images", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_images")
        .select("storage_path, sort_order, caption")
        .eq("listing_id", listingId)
        .order("sort_order");
      if (error) throw error;
      const images = (data ?? []) as ListingGalleryImage[];
      const imgUrls = await signListingImageUrls(images.map((i) => i.storage_path));
      return { images, imgUrls };
    },
    enabled: enabled && !!listingId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    images: query.data?.images ?? [],
    imgUrls: query.data?.imgUrls ?? {},
    isLoading: query.isLoading,
  };
}
