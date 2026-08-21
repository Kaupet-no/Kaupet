import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { showErrorToast } from "@/lib/toast";
import { describeImageError, validateImages } from "@/lib/storage";
import { compressImage } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { isNative, pickNativePhoto } from "@/lib/native";
import { formatErrorMessage } from "@/lib/errors";

export type PendingImage = {
  id: string;
  file: File;
  thumbFile: File;
  previewUrl: string;
  caption?: string;
};

function SortableImageItem({
  img,
  idx,
  count,
  onMove,
  onRemove,
  onCaptionChange,
}: {
  img: PendingImage;
  idx: number;
  count: number;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: img.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`space-y-1 ${isDragging ? "z-10" : ""}`}
    >
      <div
        className={`group relative aspect-square touch-manipulation overflow-hidden rounded-lg border border-border bg-muted ${
          isDragging ? "cursor-grabbing opacity-80 shadow-lg" : "cursor-grab"
        }`}
        {...attributes}
        {...listeners}
      >
        <img
          src={img.previewUrl}
          alt={
            idx === 0
              ? `Hovedbilde av annonsen (${img.file.name})`
              : `Bilde ${idx + 1} av annonsen (${img.file.name})`
          }
          className="size-full object-cover"
          draggable={false}
        />
        {idx === 0 && (
          <span className="absolute left-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
            Hoved
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <div className="flex">
            <button
              type="button"
              onClick={() => onMove(img.id, -1)}
              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
              disabled={idx === 0}
              aria-label="Flytt bakover"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(img.id, 1)}
              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
              disabled={idx === count - 1}
              aria-label="Flytt fremover"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onRemove(img.id)}
            className="rounded p-1 text-white hover:bg-destructive"
            aria-label="Fjern bilde"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <input
        type="text"
        value={img.caption ?? ""}
        onChange={(e) => onCaptionChange(img.id, e.target.value)}
        placeholder="Bildetekst (valgfritt)"
        maxLength={140}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </li>
  );
}

export function ImageUploader({
  images,
  onChange,
  uploadProgress,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
  uploadProgress?: { done: number; total: number } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      setProcessing(true);
      try {
        const [compressed, thumbs] = await Promise.all([
          Promise.all(files.map((file) => compressImage(file, "listing"))),
          Promise.all(files.map((file) => compressImage(file, "listing-thumb"))),
        ]);
        const err = validateImages(compressed);
        if (err) {
          showErrorToast(describeImageError(err));
          return;
        }
        const next: PendingImage[] = compressed.map((file, i) => ({
          id: crypto.randomUUID(),
          file,
          thumbFile: thumbs[i],
          previewUrl: URL.createObjectURL(file),
        }));
        onChange([...images, ...next]);
      } catch (error) {
        showErrorToast(formatErrorMessage(error, "Kunne ikke behandle bildene. Prøv igjen."));
      } finally {
        setProcessing(false);
      }
    },
    [images, onChange],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl) return;
    void addFiles(Array.from(fl));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (id: string) => {
    const target = images.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((i) => i.id !== id));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = images.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= images.length) return;
    const copy = [...images];
    const [item] = copy.splice(idx, 1);
    copy.splice(newIdx, 0, item);
    onChange(copy);
  };

  const setCaption = (id: string, caption: string) => {
    onChange(images.map((i) => (i.id === id ? { ...i, caption } : i)));
  };

  // Aktiveringsterskler gjør at vanlige klikk/tapp på knappene i flisene
  // ikke starter en dra-operasjon.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = images.findIndex((i) => i.id === active.id);
    const to = images.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(images, from, to));
  };

  return (
    <div className="space-y-3" data-composer-no-swipe>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-surface hover:border-primary/40"
        }`}
      >
        <ImagePlus className="mb-2 size-7 text-muted-foreground" />
        <p className="text-sm font-medium">
          {dragOver ? "Slipp her for å laste opp" : "Legg til bilder"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        {/* On native: camera is primary action */}
        {isNative() ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={async () => {
                try {
                  const file = await pickNativePhoto();
                  if (file) await addFiles([file]);
                } catch (e: unknown) {
                  showErrorToast(formatErrorMessage(e, "Kunne ikke åpne kameraet"));
                }
              }}
              disabled={processing}
            >
              <Camera className="size-4" /> Ta bilde / velg fra galleri
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={processing}
            >
              Velg fra filer
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
          >
            Velg bilder
          </Button>
        )}
      </div>

      {processing && (
        <p className="text-sm font-medium text-primary" role="status" aria-live="polite">
          Behandler bilder…
        </p>
      )}

      {uploadProgress && (
        <p className="text-sm font-medium text-primary" role="status" aria-live="polite">
          Laster opp bilde {uploadProgress.done} av {uploadProgress.total}…
        </p>
      )}

      {images.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {images.length} {images.length === 1 ? "bilde" : "bilder"}
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, idx) => (
                  <SortableImageItem
                    key={img.id}
                    img={img}
                    idx={idx}
                    count={images.length}
                    onMove={move}
                    onRemove={remove}
                    onCaptionChange={setCaption}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <p className="text-xs text-muted-foreground">
            Dra bildene for å endre rekkefølgen. Det første bildet blir hovedbildet.
          </p>
        </>
      )}
    </div>
  );
}
