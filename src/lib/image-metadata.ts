// Delt, ren metadata-deteksjon for bilder. containsImageMetadata gjelder
// bilder som sendes til Mistral for fotoassistert forslag. Brukes både
// klientside (photo-suggestion-images.ts) og serverside
// (category-suggestion-ai.server.ts) som forsvar i dybden mot
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

// IPTC DigitalSourceType for KI-genererte bilder. Står som klartekst både i
// C2PA-manifester (JUMBF/CBOR) og i XMP, og dekker også
// "compositeWithTrainedAlgorithmicMedia". ponytail: bytesøk, ikke validering
// av C2PA-signaturen — fjernet metadata (skjermbilde, ny lagring) gir false,
// og forfalsket metadata gir true. Valider manifestet (c2pa-js) eller legg til
// SynthID hvis merket skal tåle det.
const AI_SOURCE_TYPE_MARKER = "rainedAlgorithmicMedia";

// Filen leses i biter, så et stort originalbilde ikke holdes i minnet to
// ganger (bytes og tekst) samtidig.
const CHUNK_BYTES = 1024 * 1024;

/** True hvis originalfilen er merket som KI-generert via C2PA eller IPTC/XMP.
 * Må kjøres før komprimering, som fjerner metadataen. */
export async function isAiGeneratedImage(file: Blob): Promise<boolean> {
  const decoder = new TextDecoder("latin1");
  // Bitene overlapper, så en markør som krysser en grense også blir funnet.
  const overlap = AI_SOURCE_TYPE_MARKER.length - 1;
  for (let start = 0; start < file.size; start += CHUNK_BYTES) {
    const chunk = file.slice(Math.max(0, start - overlap), start + CHUNK_BYTES);
    if (decoder.decode(await chunk.arrayBuffer()).includes(AI_SOURCE_TYPE_MARKER)) return true;
  }
  return false;
}
