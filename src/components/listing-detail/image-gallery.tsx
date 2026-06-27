import { useState, useEffect } from "react";
import { useIsNative } from "@/lib/use-is-native";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

type ListingImage = { storage_path: string; sort_order: number };

export function ImageGallery({
  images,
  imgUrls,
  activeImage,
  onSelect,
  title,
  onImageClick,
}: {
  images: ListingImage[];
  imgUrls: Record<string, string>;
  activeImage: number;
  onSelect: (index: number) => void;
  title: string;
  onImageClick?: (index: number) => void;
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
      <div className="mt-3 flex gap-2 overflow-x-auto" role="list">
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

  if (isNative && images.length > 0) {
    return (
      <>
        <Carousel
          opts={{ align: "center", loop: false, startIndex: activeImage }}
          setApi={setCarouselApi}
          className="w-full"
        >
          <CarouselContent className="ml-0">
            {images.map((img, i) => (
              <CarouselItem key={img.storage_path} className="pl-0">
                <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                  {onImageClick ? (
                    <button
                      type="button"
                      onClick={() => onImageClick(i)}
                      aria-label="Se bilde i fullskjerm"
                      className="size-full"
                    >
                      <img
                        src={imgUrls[img.storage_path]}
                        alt={title}
                        className="size-full object-contain"
                      />
                    </button>
                  ) : (
                    <img
                      src={imgUrls[img.storage_path]}
                      alt={title}
                      className="size-full object-contain"
                    />
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        {thumbnailStrip}
      </>
    );
  }

  return (
    <>
      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
        {images.length > 0 ? (
          onImageClick ? (
            <button
              type="button"
              onClick={() => onImageClick(activeImage)}
              aria-label="Se bilde i fullskjerm"
              className="size-full cursor-zoom-in"
            >
              <img
                src={imgUrls[images[activeImage].storage_path]}
                alt={title}
                className="size-full object-contain"
              />
            </button>
          ) : (
            <img
              src={imgUrls[images[activeImage].storage_path]}
              alt={title}
              className="size-full object-contain"
            />
          )
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Ingen bilder
          </div>
        )}
      </div>
      {thumbnailStrip}
    </>
  );
}
