// Ren klientmodul: forbereder bildeminiatyrer for det fotoassisterte
// KI-forslaget (suggestListingFromPhotos, se category-suggestion.functions.ts)
// før eksplisitt brukersamtykke sender dem til Mistral. Nedskalerer hardt
// (Mistral teller bildetokens etter pikseldimensjoner, ikke filstørrelse),
// re-enkoder alltid til JPEG via canvas for å fjerne EXIF/GPS, og verifiserer
// i etterkant at resultatet faktisk er fritt for metadata før det sendes.
//
// Grensene her er en klientside-kopi av serverens grenser
// (category-suggestion-ai.server.ts) — dataminimering i dybden, ikke eneste
// forsvarslinje.

import { compressImage, type CompressPreset } from "@/lib/image-compression";
import { containsImageMetadata } from "@/lib/image-metadata";

export type PhotoSuggestionOperation = "identify" | "attributes";

/** Kilde for personvernteksten/UI: samme tall som håndheves her og på serveren. */
export const PHOTO_SUGGESTION_LIMITS: Record<
  PhotoSuggestionOperation,
  { maxImages: number; maxDimension: number }
> = {
  identify: { maxImages: 2, maxDimension: 480 },
  attributes: { maxImages: 3, maxDimension: 768 },
};

/** Matcher serverens PHOTO_MAX_BYTES (150 KiB dekodet per bilde). */
export const PHOTO_SUGGESTION_MAX_BYTES = 150 * 1024;

const PRESET_BY_OPERATION: Record<PhotoSuggestionOperation, CompressPreset> = {
  identify: "ai-identify",
  attributes: "ai-attributes",
};

// btoa/String.fromCharCode over a chunked view, not FileReader.readAsDataURL:
// we already need the raw bytes for the metadata check below, and this keeps
// the module working in both browser and Node (test) environments.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Velger de første bildene (i brukerens rekkefølge) for `operation`,
 * nedskalerer og re-enkoder dem til JPEG, og dropper ethvert bilde som
 * fortsatt inneholder metadata eller ikke kommer under størrelsesgrensen —
 * i stedet for å sende det til Mistral.
 */
export async function preparePhotoSuggestionImages(
  files: File[],
  operation: PhotoSuggestionOperation,
): Promise<{ mime: "image/jpeg"; dataUrl: string }[]> {
  const limit = PHOTO_SUGGESTION_LIMITS[operation];
  const preset = PRESET_BY_OPERATION[operation];
  const results: { mime: "image/jpeg"; dataUrl: string }[] = [];

  for (const file of files.slice(0, limit.maxImages)) {
    const compressed = await compressImage(file, preset);
    if (compressed.type !== "image/jpeg" || compressed.size > PHOTO_SUGGESTION_MAX_BYTES) {
      continue;
    }
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    if (containsImageMetadata(bytes)) continue;

    results.push({ mime: "image/jpeg", dataUrl: `data:image/jpeg;base64,${bytesToBase64(bytes)}` });
  }

  return results;
}
