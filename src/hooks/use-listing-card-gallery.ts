import { useEffect, useRef, useState } from "react";

import { useListingImageFallback } from "@/hooks/use-listing-image-fallback";
import { useListingGalleryImages } from "@/hooks/use-listing-gallery-images";
import { signListingImageUrls } from "@/lib/storage";

export function useListingCardGallery(
  listingId: string,
  coverPath: string | null,
  coverImageUrl?: string | null,
) {
  const rootRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const { images, imgUrls, isLoading } = useListingGalleryImages(listingId, inView);
  const originalUrl = coverPath ? signListingImageUrls([coverPath])[coverPath] : null;
  const { effectiveImageUrl, handleImageError } = useListingImageFallback(
    coverImageUrl ?? null,
    originalUrl,
  );

  return { rootRef, images, imgUrls, isLoading, effectiveImageUrl, handleImageError };
}
