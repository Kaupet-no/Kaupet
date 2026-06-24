import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Lightbulb, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { MAX_IMAGES, describeImageError, validateImages } from "@/lib/storage";
import { compressImage } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { isNative, pickNativePhoto } from "@/lib/native";
import { formatErrorMessage } from "@/lib/errors";

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

const GUIDE_KEY = "kaupet_photo_guide_seen";

function PhotoGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="font-medium">Tips for gode bilder</p>
        <ul className="space-y-0.5 text-muted-foreground">
          <li>· Sørg for nok lys. Ta gjerne bildet ute eller ved et vindu.</li>
          <li>
            · Bidra til å holde fokuset på objektet du skal selge. Ha en ryddig og nøytral bakgrunn.
          </li>
          <li>· Sørg for å ta bilde av eventuelle feil eller slitasje.</li>
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-500 hover:text-amber-700"
        aria-label="Lukk tips"
      >
        <X className="size-4" />
      </button>
    </div>
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
  const [showGuide, setShowGuide] = useState(false);

  // Show guide on first-ever visit (not subsequent sessions)
  useEffect(() => {
    if (!localStorage.getItem(GUIDE_KEY)) {
      setShowGuide(true);
    }
  }, []);

  function dismissGuide() {
    localStorage.setItem(GUIDE_KEY, "1");
    setShowGuide(false);
  }

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length + images.length > MAX_IMAGES) {
        toast.error(describeImageError({ kind: "too-many", allowed: MAX_IMAGES }));
        return;
      }
      setProcessing(true);
      try {
        const compressed = await Promise.all(files.map((file) => compressImage(file, "listing")));
        const err = validateImages(compressed, images.length);
        if (err) {
          toast.error(describeImageError(err));
          return;
        }
        const next: PendingImage[] = compressed.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        onChange([...images, ...next]);
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

  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="space-y-3">
      {showGuide && <PhotoGuide onDismiss={dismissGuide} />}

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
        <p className="text-sm font-medium">
          {dragOver ? "Slipp her for å laste opp" : "Slipp bilder her eller velg fra enheten"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG eller WebP. Maks {MAX_IMAGES} bilder. Store bilder komprimeres automatisk.
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
                  if (file) addFiles([file]);
                } catch (e: unknown) {
                  toast.error(formatErrorMessage(e, "Kunne ikke åpne kameraet"));
                }
              }}
              disabled={atLimit || processing}
            >
              <Camera className="size-4" /> Ta bilde / velg fra galleri
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={atLimit || processing}
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
            disabled={atLimit || processing}
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
                  alt={
                    idx === 0
                      ? `Hovedbilde av annonsen (${img.file.name})`
                      : `Bilde ${idx + 1} av annonsen (${img.file.name})`
                  }
                  className="size-full object-cover"
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
