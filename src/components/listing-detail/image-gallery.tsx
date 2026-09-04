import { useState, useEffect, type ReactNode } from "react";
import {
  Maximize2,
  RotateCw,
  X,
  ChevronLeft,
  ChevronRight,
  Move,
  ImagePlus,
  Loader2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useIsNative } from "@/hooks/use-is-native";
import { ScrollArrowRow } from "@/components/scroll-arrow-row";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Vehicle360Viewer,
  type Vehicle360Frame,
} from "@/components/listing-detail/vehicle/vehicle-360-viewer";
import { useListingEdit } from "@/features/listing-edit/edit-mode-context";
import {
  useInlineListingImages,
  type InlineImageItem,
  type InlineListingImages,
} from "@/features/listing-edit/use-inline-listing-images";
import { IMAGE_ACCEPT } from "@/lib/storage";
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
  vehicle360,
  showThumbnails = true,
  fit = "contain",
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
  /** 360°-bildesekvens, rendret som det aller første elementet i karusellen
   * (samme størrelse som de vanlige bildene) — ikke som en egen fane. Skyver
   * de vanlige bildenes indekser én opp (`activeImage`/`onSelect` regner i
   * dette kombinerte indeksrommet). */
  vehicle360?: { frames: Vehicle360Frame[]; imgUrls: Record<string, string> };
  /** Slått av i trange kontekster (f.eks. søkeresultat-kort) — piltastene og
   * karusellpilene er nok til å bla, thumbnail-raden tar mye vertikal plass. */
  showThumbnails?: boolean;
  /** "contain" (standard, detaljsiden) viser hele bildet med en blurret
   * letterbox-bakgrunn der proporsjonen ikke fyller 4:3-boksen. "cover"
   * beskjærer i stedet bildet til å fylle boksen helt — for kompakte
   * bla-gjennom-kort (f.eks. Bilder-visningen) der en tekst-overlay ligger
   * oppå bildet og letterbox-stripene ville brutt opp den flaten. */
  fit?: "contain" | "cover";
}) {
  const isNative = useIsNative();
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const editCtx = useListingEdit();
  const inlineImages = useInlineListingImages({
    listingId: editCtx?.listingId ?? "",
    images,
    imgUrls,
  });

  const has360 = !!vehicle360 && vehicle360.frames.length > 0;
  const offset = has360 ? 1 : 0;
  const totalSlides = images.length + offset;

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

  useEffect(() => {
    if (!carouselApi || totalSlides <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Skjer ikke om brukeren skriver i et felt, eller mens lightboxen (som
      // har sin egen piltast-håndtering) er åpen over dette galleriet.
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowLeft") carouselApi.scrollPrev();
      else if (e.key === "ArrowRight") carouselApi.scrollNext();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [carouselApi, totalSlides]);

  const thumbnailStrip =
    showThumbnails && totalSlides > 1 ? (
      <ScrollArrowRow className="mt-10">
        {has360 && (
          <button
            type="button"
            onClick={() => onSelect(0)}
            aria-label="Vis 360°-visning"
            aria-pressed={activeImage === 0}
            className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-muted ${
              activeImage === 0 ? "border-primary" : "border-transparent"
            }`}
          >
            <RotateCw className="size-6 text-muted-foreground" />
          </button>
        )}
        {images.map((img, i) => {
          const absoluteIndex = i + offset;
          return (
            <button
              key={img.storage_path}
              type="button"
              onClick={() => onSelect(absoluteIndex)}
              aria-label={`Vis bilde ${i + 1} av ${images.length} for «${title}»`}
              aria-pressed={absoluteIndex === activeImage}
              className={`size-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                absoluteIndex === activeImage ? "border-primary" : "border-transparent"
              }`}
            >
              {imgUrls[img.storage_path] && (
                <img src={imgUrls[img.storage_path]} alt="" className="size-full object-cover" />
              )}
            </button>
          );
        })}
      </ScrollArrowRow>
    ) : null;

  if (totalSlides > 0) {
    return (
      <>
        <div className="relative">
          <Carousel
            opts={{ align: "center", loop: true, startIndex: activeImage }}
            setApi={setCarouselApi}
            className="w-full"
          >
            <CarouselContent className="ml-0">
              {has360 && (
                <CarouselItem key="360" className="pl-0">
                  <div className="relative overflow-hidden rounded-xl border border-border">
                    <Vehicle360Viewer
                      frames={vehicle360.frames}
                      imgUrls={vehicle360.imgUrls}
                      title={title}
                    />
                    {onImageClick && (
                      <button
                        type="button"
                        onClick={() => onImageClick(0)}
                        aria-label="Se 360°-visning i fullskjerm"
                        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                      >
                        <Maximize2 className="size-4" />
                      </button>
                    )}
                  </div>
                </CarouselItem>
              )}
              {images.map((img, i) => {
                const absoluteIndex = i + offset;
                return (
                  <CarouselItem key={img.storage_path} className="pl-0">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                      {fit === "contain" && <BlurredBackdrop src={imgUrls[img.storage_path]} />}
                      {onImageClick ? (
                        <button
                          type="button"
                          onClick={() => onImageClick(absoluteIndex)}
                          aria-label="Se bilde i fullskjerm"
                          className="relative size-full"
                        >
                          <img
                            src={imgUrls[img.storage_path]}
                            alt={i === 0 && !has360 ? title : `${title} – bilde ${i + 1}`}
                            className={`relative size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
                          />
                        </button>
                      ) : (
                        <img
                          src={imgUrls[img.storage_path]}
                          alt={i === 0 && !has360 ? title : `${title} – bilde ${i + 1}`}
                          className={`relative size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
                        />
                      )}
                      <ImageCaption caption={img.caption} />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            {!isNative && totalSlides > 1 && (
              <>
                <CarouselPrevious className="left-3 border-border bg-card/90 backdrop-blur" />
                <CarouselNext className="right-3 border-border bg-card/90 backdrop-blur" />
              </>
            )}
          </Carousel>
          {overlaySlot}
        </div>
        {thumbnailStrip}
        {editCtx?.editMode && <ImageEditControls inline={inlineImages} />}
      </>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Ingen bilder
      </div>
      {editCtx?.editMode && (
        <div className="mt-3">
          <ImageEditControls inline={inlineImages} />
        </div>
      )}
    </div>
  );
}

/** Editing controls (remove/reorder/caption/add) for the thumbnail strip —
 * only rendered when `useListingEdit()?.editMode` is true; the main
 * carousel above stays view-only. */
function SortableInlineImageItem({
  item,
  index,
  count,
  imgUrls,
  onMove,
  onRemove,
  onCaptionChange,
}: {
  item: InlineImageItem;
  index: number;
  count: number;
  imgUrls: Record<string, string>;
  onMove: (storagePath: string, direction: -1 | 1) => void;
  onRemove: (storagePath: string) => void;
  onCaptionChange: (storagePath: string, caption: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: item.storage_path,
      disabled: item.uploading,
    });
  const src = imgUrls[item.storage_path];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`space-y-1 ${isDragging ? "z-10" : ""}`}
    >
      <div
        className={`group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted ${
          isDragging
            ? "cursor-grabbing opacity-80 shadow-lg"
            : isOver
              ? "ring-2 ring-primary ring-offset-2"
              : ""
        }`}
      >
        {item.uploading ? (
          <div className="flex size-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : src ? (
          <img src={src} alt="" className="size-full object-cover" draggable={false} />
        ) : null}
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={item.uploading}
          className="native-touch-target absolute left-1 top-1 flex cursor-grab items-center justify-center rounded-md bg-black/60 text-white active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Dra bilde ${index + 1} for å endre rekkefølge`}
        >
          <Move className="size-4" aria-hidden="true" />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
          <div className="flex">
            <button
              type="button"
              onClick={() => onMove(item.storage_path, -1)}
              className="native-touch-target rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
              disabled={index === 0}
              aria-label="Flytt venstre"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(item.storage_path, 1)}
              className="native-touch-target rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
              disabled={index === count - 1}
              aria-label="Flytt høyre"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.storage_path)}
            className="native-touch-target rounded p-1 text-white hover:bg-destructive"
            aria-label="Fjern bilde"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <input
        type="text"
        value={item.caption ?? ""}
        onChange={(e) => onCaptionChange(item.storage_path, e.target.value)}
        placeholder="Bildetekst (valgfritt)"
        maxLength={140}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </li>
  );
}

/** Editing controls (remove/reorder/caption/add) for the thumbnail strip —
 * only rendered when `useListingEdit()?.editMode` is true; the main
 * carousel above stays view-only. */
function ImageEditControls({ inline }: { inline: InlineListingImages }) {
  const { items, imgUrls, fileInputRef, addFiles, removeItem, move, moveTo, setCaption } = inline;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    void moveTo(String(active.id), String(over.id));
  }

  return (
    <div className="mt-3 space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((item) => item.storage_path)}
          strategy={rectSortingStrategy}
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, index) => (
              <SortableInlineImageItem
                key={item.storage_path}
                item={item}
                index={index}
                count={items.length}
                imgUrls={imgUrls}
                onMove={move}
                onRemove={removeItem}
                onCaptionChange={setCaption}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const fl = e.target.files;
          if (fl) addFiles(Array.from(fl));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <ImagePlus className="size-4" />
        Last opp bilder
      </button>
    </div>
  );
}
