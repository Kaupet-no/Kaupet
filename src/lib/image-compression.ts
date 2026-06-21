// Klientside-komprimering av bilder før opplasting til Supabase Storage.
// Sparer både lagringsplass og brukernes opplastingsbåndbredde. Biblioteket
// håndterer EXIF-rotasjon (viktig for mobilbilder), nedskalering og kjører i en
// web worker slik at UI ikke blokkeres. Utdata er alltid WebP — formatet er
// allerede tillatt i begge bucketene (se ALLOWED_MIME i storage.ts).

import imageCompression from "browser-image-compression";

export type CompressPreset = "avatar" | "listing";

type PresetConfig = {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  initialQuality: number;
};

// Avatarer rendres lite (~80px) og kan komprimeres hardt. Annonsebilder trenger
// høyere oppløsning, men kan fortsatt skaleres betraktelig ned fra originalen.
const PRESETS: Record<CompressPreset, PresetConfig> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.15, initialQuality: 0.7 },
  listing: { maxWidthOrHeight: 1600, maxSizeMB: 0.6, initialQuality: 0.8 },
};

function toWebpName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.webp`;
}

/**
 * Komprimer og nedskaler et bilde til WebP. Fail-safe: hvis komprimeringen
 * feiler, eller resultatet blir større enn originalen, returneres originalfilen
 * uendret — opplasting skal aldri brytes av komprimeringssteget.
 */
export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  const cfg = PRESETS[preset];
  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: cfg.maxWidthOrHeight,
      maxSizeMB: cfg.maxSizeMB,
      initialQuality: cfg.initialQuality,
      fileType: "image/webp",
      useWebWorker: true,
    });
    // Behold den minste av original og komprimert.
    if (compressed.size >= file.size) return file;
    return new File([compressed], toWebpName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("Bildekomprimering feilet, laster opp original", err);
    return file;
  }
}
