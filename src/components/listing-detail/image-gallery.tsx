import { useState, useEffect, type ReactNode } from "react";
import { useIsNative } from "@/hooks/use-is-native";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

type ListingImage = { storage_path: string; sort_order: number; caption?: string | null };

function ImageCaption({ caption }: { caption?: string | null }) {
  if (!caption) return null;
  return (
    <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs text-white">
      {caption}
    </p>
  );
}

/** Blurred, scaled echo of the image filling the frame behind an
 * `object-contain` image, so letterbox bars read as a soft glow instead of a
 * flat grey/muted bar when the photo's aspect ratio doesn't match 4:3. */
function BlurredBackdrop({ src }: { src?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
    />
  );
}

export function ImageGallery({
  images,
  imgUrls,
  activeImage,
  onSelect,
  title,
  onImageClick,
  overlaySlot,
}: {
  images: ListingImage[];
  imgUrls: Record<string, string>;
  activeImage: number;
  onSelect: (index: number) => void;
  title: string;
  onImageClick?: (index: number) => void;
  /** Rendered absolutely-positioned over just the main image (e.g. the price
   * badge) — scoped to a wrapper around the carousel alone, not the
   * thumbnail strip below it, so it can't hang down into the thumbnails. */
  overlaySlot?: ReactNode;
}) {
  const isNative = useIsNative();
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!carouselApi) return;
    if (carouselApi.selectedScrollSnap() !== activeImage) {
      carouselApi.scrollTo(activeImage);
    }
  }, [carouselApi, activeImage]);

  useEffect(() => {
    if (!carouselApi) return;
    const handleSlideSelect = () => onSelect(carouselApi.selectedScrollSnap());
    carouselApi.on("select", handleSlideSelect);
    return () => {
      carouselApi.off("select", handleSlideSelect);
    };
  }, [carouselApi, onSelect]);

  const thumbnailStrip =
    images.length > 1 ? (
      <div className="mt-10 flex gap-2 overflow-x-auto" role="list">
        {images.map((img, i) => (
          <button
            key={img.storage_path}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Vis bilde ${i + 1} av ${images.length} for «${title}»`}
            aria-pressed={i === activeImage}
            className={`size-20 shrink-0 overflow-hidden rounded-lg border-2 ${
              i === activeImage ? "border-primary" : "border-transparent"
            }`}
          >
            {imgUrls[img.storage_path] && (
              <img src={imgUrls[img.storage_path]} alt="" className="size-full object-cover" />
            )}
          </button>
        ))}
      </div>
    ) : null;

  if (images.length > 0) {
    return (
      <>
        <div className="relative">
          <Carousel
            opts={{ align: "center", loop: false, startIndex: activeImage }}
            setApi={setCarouselApi}
            className="w-full"
          >
            <CarouselContent className="ml-0">
              {images.map((img, i) => (
                <CarouselItem key={img.storage_path} className="pl-0">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    <BlurredBackdrop src={imgUrls[img.storage_path]} />
                    {onImageClick ? (
                      <button
                        type="button"
                        onClick={() => onImageClick(i)}
                        aria-label="Se bilde i fullskjerm"
                        className="relative size-full"
                      >
                        <img
                          src={imgUrls[img.storage_path]}
                          alt={title}
                          className="relative size-full object-contain"
                        />
                      </button>
                    ) : (
                      <img
                        src={imgUrls[img.storage_path]}
                        alt={title}
                        className="relative size-full object-contain"
                      />
                    )}
                    <ImageCaption caption={img.caption} />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {!isNative && images.length > 1 && (
              <>
                <CarouselPrevious className="left-3 border-border bg-card/90 backdrop-blur" />
                <CarouselNext className="right-3 border-border bg-card/90 backdrop-blur" />
              </>
            )}
          </Carousel>
          {overlaySlot}
        </div>
        {thumbnailStrip}
      </>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Ingen bilder
      </div>
    </div>
  );
}
