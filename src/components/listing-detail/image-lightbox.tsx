import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { X, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import {
  Vehicle360Viewer,
  type Vehicle360Frame,
} from "@/components/listing-detail/vehicle/vehicle-360-viewer";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import { ZoomableImage } from "@/components/listing-detail/zoomable-image";
import { lockPortraitOnPhone, unlockOrientation } from "@/lib/orientation";

type ListingImage = { storage_path: string; sort_order: number; caption?: string | null };

type Props = {
  images: ListingImage[];
  imgUrls: Record<string, string>;
  initialIndex: number;
  title: string;
  onClose: () => void;
  /** Samme kombinerte indeksrom som `ImageGallery` — 360°-visningen (om den
   * finnes) er slide 0, og de vanlige bildene er forskjøvet én opp. */
  vehicle360?: { frames: Vehicle360Frame[]; imgUrls: Record<string, string> };
};

export function ImageLightbox({
  images,
  imgUrls,
  initialIndex,
  title,
  onClose,
  vehicle360,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // Zoomet bilde eier gesten selv — Emblas dra-gest slås av mens den varer.
  // Ref, ikke state: `watchDrag` leses ved pointerdown, og en reInit ville
  // hoppet karusellen tilbake til start.
  const zoomedRef = useRef(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: initialIndex,
    loop: true,
    watchDrag: () => !zoomedRef.current,
  });
  const onZoomChange = useCallback((zoomed: boolean) => {
    zoomedRef.current = zoomed;
  }, []);

  const has360 = !!vehicle360 && vehicle360.frames.length > 0;
  const offset = has360 ? 1 : 0;
  const totalSlides = images.length + offset;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Bildevisning er det eneste stedet telefonen får rotere. Opprydningen
  // ligger i unmount, ikke i lukkeknappen, så låsen ikke blir stående av om
  // galleriet forsvinner en annen vei (navigasjon, tilbake-gest).
  useEffect(() => {
    void unlockOrientation();
    return () => {
      void lockPortraitOnPhone();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
      else if (e.key === "ArrowRight") emblaApi?.scrollNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emblaApi]);

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
    <FullscreenOverlay open onOpenChange={(next) => !next && onClose()}>
      {/* Clicking the backdrop (anywhere that isn't a button or thumbnail) closes the lightbox */}
      <FullscreenOverlayContent
        title={`Bildegalleri for ${title}`}
        onClick={onClose}
        // edgeToEdge: bakteppet og bildet skal dekke hele skjermen — padres
        // containeren, får man en stripe av app-bakgrunn langs notchen. Det er
        // chromet under som tar safe area i stedet.
        edgeToEdge
        className="bg-black/65 backdrop-blur-sm"
      >
        {/* Top bar */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-between px-safe pt-safe pb-3"
        >
          <span className="text-sm text-white/60">
            {totalSlides > 1 ? `${currentIndex + 1} / ${totalSlides}` : ""}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Lukk bildegalleri"
            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Carousel — clicks bubble up to the backdrop and close the lightbox */}
        <div className="relative min-h-0 flex-1 overflow-hidden" ref={emblaRef}>
          <div className="flex h-full">
            {has360 && (
              <div className="relative flex h-full min-w-0 flex-[0_0_100%] items-center justify-center">
                <div className="w-full max-w-full" onClick={(e) => e.stopPropagation()}>
                  <Vehicle360Viewer
                    frames={vehicle360.frames}
                    imgUrls={vehicle360.imgUrls}
                    title={title}
                  />
                </div>
              </div>
            )}
            {images.map((img, i) => (
              <div key={img.storage_path} className="relative h-full min-w-0 flex-[0_0_100%]">
                <ZoomableImage
                  src={imgUrls[img.storage_path]}
                  alt={i === 0 && !has360 ? title : `${title} – bilde ${i + 1}`}
                  onZoomChange={onZoomChange}
                  onDismiss={onClose}
                />
                {img.caption && (
                  <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 text-center text-sm text-white">
                    {img.caption}
                  </p>
                )}
              </div>
            ))}
          </div>

          {totalSlides > 1 && (
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
        {totalSlides > 1 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex justify-center gap-2 overflow-x-auto px-safe pt-3 pb-safe"
          >
            {has360 && (
              <button
                type="button"
                onClick={() => emblaApi?.scrollTo(0)}
                aria-label="Gå til 360°-visning"
                aria-pressed={currentIndex === 0}
                className={`flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-white/10 transition-colors ${
                  currentIndex === 0 ? "border-white" : "border-transparent opacity-50"
                }`}
              >
                <RotateCw className="size-5 text-white" />
              </button>
            )}
            {images.map((img, i) => {
              const absoluteIndex = i + offset;
              return (
                <button
                  key={img.storage_path}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(absoluteIndex)}
                  aria-label={`Gå til bilde ${i + 1}`}
                  aria-pressed={absoluteIndex === currentIndex}
                  className={`size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                    absoluteIndex === currentIndex
                      ? "border-white"
                      : "border-transparent opacity-50"
                  }`}
                >
                  <img src={imgUrls[img.storage_path]} alt="" className="size-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </FullscreenOverlayContent>
    </FullscreenOverlay>
  );
}
