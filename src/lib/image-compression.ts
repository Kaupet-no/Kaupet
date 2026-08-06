// Klientside-komprimering av bilder før opplasting til Supabase Storage.
// Sparer både lagringsplass og brukernes opplastingsbåndbredde. Biblioteket
// håndterer EXIF-rotasjon (viktig for mobilbilder), nedskalering og kjører i en
// web worker slik at UI ikke blokkeres. Utdata er alltid WebP — formatet er
// allerede tillatt i begge bucketene (se ALLOWED_MIME i storage.ts).

import imageCompression from "browser-image-compression";

export type CompressPreset = "avatar" | "listing" | "vehicle360";

type PresetConfig = {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  initialQuality: number;
};

// Avatarer rendres lite (~80px) og kan komprimeres hardt. Annonsebilder trenger
// høyere oppløsning, men kan fortsatt skaleres betraktelig ned fra originalen.
// 360-frames vises kun små/animert i spin-visningen, aldri i full skjerm
// enkeltvis — komprimeres derfor hardere enn galleribilder.
const PRESETS: Record<CompressPreset, PresetConfig> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.15, initialQuality: 0.7 },
  listing: { maxWidthOrHeight: 1600, maxSizeMB: 0.6, initialQuality: 0.8 },
  vehicle360: { maxWidthOrHeight: 1024, maxSizeMB: 0.3, initialQuality: 0.82 },
};

function toWebpName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.webp`;
}

// Vannmerket er favicon-merket, tegnet nederst til høyre uten bakgrunnsplate —
// bare en skygge holder det synlig på både lyse og mørke bilder.
const WATERMARK_SRC = "/favicon.ico";
let watermarkImagePromise: Promise<HTMLImageElement> | null = null;

function loadWatermarkImage(): Promise<HTMLImageElement> {
  if (!watermarkImagePromise) {
    watermarkImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kunne ikke laste vannmerke"));
      img.src = WATERMARK_SRC;
    });
  }
  return watermarkImagePromise;
}

/**
 * Tegner favicon-merket nederst til høyre på bildet. Fail-safe: hvis noe
 * feiler, returneres filen uendret — vannmerking skal aldri brytes
 * opplastingen.
 */
async function drawWatermark(file: File): Promise<File> {
  try {
    const [bitmap, mark] = await Promise.all([createImageBitmap(file), loadWatermarkImage()]);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    // ~4,5 % av korteste bildekant, tilsvarende "liten"-varianten fra forslagene.
    const size = Math.min(
      64,
      Math.max(24, Math.round(Math.min(bitmap.width, bitmap.height) * 0.045)),
    );
    const margin = Math.round(size * 0.5);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = 1;
    ctx.drawImage(mark, bitmap.width - size - margin, bitmap.height - size - margin, size, size);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) return file;
    return new File([blob], toWebpName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("Vannmerking feilet, laster opp uten vannmerke", err);
    return file;
  }
}

/**
 * Komprimer og nedskaler et bilde til WebP. Fail-safe: hvis komprimeringen
 * feiler, eller resultatet blir større enn originalen, returneres originalfilen
 * uendret — opplasting skal aldri brytes av komprimeringssteget.
 *
 * Annonsebilder (preset "listing"/"vehicle360") får i tillegg et lite
 * favicon-vannmerke nederst til høyre. Avatarer vannmerkes ikke.
 */
export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  const cfg = PRESETS[preset];
  let result = file;
  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: cfg.maxWidthOrHeight,
      maxSizeMB: cfg.maxSizeMB,
      initialQuality: cfg.initialQuality,
      fileType: "image/webp",
      useWebWorker: true,
    });
    // Behold den minste av original og komprimert.
    if (compressed.size < file.size) {
      result = new File([compressed], toWebpName(file.name), {
        type: "image/webp",
        lastModified: Date.now(),
      });
    }
  } catch (err) {
    console.warn("Bildekomprimering feilet, laster opp original", err);
  }

  if (preset === "avatar") return result;
  return drawWatermark(result);
}
