// Delt, ren metadata-deteksjon for bilder som sendes til Mistral for
// fotoassistert forslag. Brukes både klientside (photo-suggestion-images.ts)
// og serverside (category-suggestion-ai.server.ts) som forsvar i dybden mot
// EXIF/GPS-lekkasje. Enkel bytesøk etter kjente markører er bevisst — ikke en
// full bildeparser.

const METADATA_MARKERS = [
  "Exif\0\0", // JPEG APP1 Exif
  "http://ns.adobe.com/xap/", // XMP (JPEG/WebP)
  "eXIf", // PNG eXIf chunk
  "EXIF", // WebP EXIF chunk (RIFF FourCC)
] as const;

/** True hvis de rå bildebytene inneholder en kjent EXIF/XMP-markør. */
export function containsImageMetadata(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  return METADATA_MARKERS.some((marker) => text.includes(marker));
}
