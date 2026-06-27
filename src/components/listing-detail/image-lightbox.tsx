import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type ListingImage = { storage_path: string; sort_order: number };

type Props = {
  images: ListingImage[];
  imgUrls: Record<string, string>;
  initialIndex: number;
  title: string;
  onClose: () => void;
};

export function ImageLightbox({ images, imgUrls, initialIndex, title, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: initialIndex });

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    history.pushState({ overlay: "image" }, "");
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      emblaApi?.scrollPrev();
    },
    [emblaApi],
  );
  const scrollNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      emblaApi?.scrollNext();
    },
    [emblaApi],
  );

  return (
    // Clicking the backdrop (anywhere that isn't a button or thumbnail) closes the lightbox
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bildegalleri for ${title}`}
      onClick={() => history.back()}
      className="fixed inset-0 z-[200] flex flex-col bg-black/65 backdrop-blur-sm"
    >
      {/* Top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between px-4 py-3"
      >
        <span className="text-sm text-white/60">
          {images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ""}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={() => history.back()}
          aria-label="Lukk bildegalleri"
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-6" />
        </button>
      </div>

      {/* Carousel — clicks bubble up to the backdrop and close the lightbox */}
      <div className="relative min-h-0 flex-1 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {images.map((img, i) => (
            <div key={img.storage_path} className="relative h-full min-w-0 flex-[0_0_100%]">
              <img
                src={imgUrls[img.storage_path]}
                alt={i === 0 ? title : `${title} – bilde ${i + 1}`}
                className="h-full w-full object-contain"
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              aria-label="Forrige bilde"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              aria-label="Neste bilde"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail bar */}
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex justify-center gap-2 overflow-x-auto px-4 py-3"
        >
          {images.map((img, i) => (
            <button
              key={img.storage_path}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Gå til bilde ${i + 1}`}
              aria-pressed={i === currentIndex}
              className={`size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                i === currentIndex ? "border-white" : "border-transparent opacity-50"
              }`}
            >
              <img src={imgUrls[img.storage_path]} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
