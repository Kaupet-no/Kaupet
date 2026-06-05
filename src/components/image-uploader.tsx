import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_IMAGES,
  describeImageError,
  validateImages,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

export function ImageUploader({
  images,
  onChange,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const err = validateImages(files, images.length);
      if (err) {
        toast.error(describeImageError(err));
        return;
      }
      const next: PendingImage[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      onChange([...images, ...next]);
    },
    [images, onChange],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl) return;
    addFiles(Array.from(fl));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
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

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-surface hover:border-primary/40"
        }`}
      >
        <ImagePlus className="mb-2 size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Slipp bilder her eller velg fra enheten</p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG eller WebP. Maks {MAX_IMAGES} bilder, 5 MB per bilde.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={images.length >= MAX_IMAGES}
        >
          Velg bilder
        </Button>
      </div>

      {images.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {images.length} av {MAX_IMAGES} bilder. Første bilde er hovedbildet.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img, idx) => (
              <li
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
              >
                <img
                  src={img.previewUrl}
                  alt={idx === 0 ? `Hovedbilde av annonsen (${img.file.name})` : `Bilde ${idx + 1} av annonsen (${img.file.name})`}
                  className="size-full object-cover"
                />
                {idx === 0 && (
                  <span className="absolute left-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                    Hoved
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => move(img.id, -1)}
                      className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                      disabled={idx === 0}
                      aria-label="Flytt venstre"
                    >
                      <GripVertical className="size-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(img.id, 1)}
                      className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                      disabled={idx === images.length - 1}
                      aria-label="Flytt høyre"
                    >
                      <GripVertical className="size-3.5 -rotate-90" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(img.id)}
                    className="rounded p-1 text-white hover:bg-destructive"
                    aria-label="Fjern bilde"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
