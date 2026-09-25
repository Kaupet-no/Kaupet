// Miljønøytral definisjon av bildekomprimeringspresetene. Ingen imports her
// (verken klient- eller serverbibliotek), slik at både klientkomprimeringen
// (`image-compression.ts`, kjører i nettleseren via `browser-image-compression`)
// og serverkomprimeringen (`image-compression.server.ts`, kjører via
// Cloudflare Images-bindingen for bilder hentet via Excel-/API-/MCP-synk) leser
// nøyaktig samme tall. Uten denne delingen kunne de to komprimeringsveiene
// drive fra hverandre og gi ulikt resultat for "samme" bilde — noe brukeren
// eksplisitt har krevd at IKKE skal skje. Se
// /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md, fase 3.

export type CompressPreset =
  "avatar" | "listing" | "listing-thumb" | "vehicle360" | "ai-identify" | "ai-attributes";

export type PresetConfig = {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  initialQuality: number;
  /** Utdataformat i nettleseren. Standard er WebP; serverkomprimeringen
   * skriver alltid WebP. */
  fileType?: "image/webp" | "image/jpeg";
  /** KI-miniatyrene skal alltid være den re-enkodede filen (nedskalert og
   * uten metadata), aldri originalen — selv om originalen er mindre. */
  alwaysUseCompressed?: boolean;
};

// Avatarer rendres lite (~80px) og kan komprimeres hardt. Annonsebilder trenger
// høyere oppløsning, men kan fortsatt skaleres betraktelig ned fra originalen.
// 360-frames vises kun små/animert i spin-visningen, aldri i full skjerm
// enkeltvis — komprimeres derfor hardere enn galleribilder. "listing-thumb"
// er den lille varianten som vises på annonsekort i søk/favoritter/etc.
// "ai-identify"/"ai-attributes" er miniatyrer for det fotoassisterte
// KI-forslaget (se photo-suggestion-images.ts) — kun klientside, alltid JPEG
// via canvas, som fjerner EXIF/GPS, og nedskalert hardt fordi Mistral teller
// bildetokens etter pikseldimensjoner, ikke filstørrelse.
export const PRESETS: Record<CompressPreset, PresetConfig> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.15, initialQuality: 0.7 },
  listing: { maxWidthOrHeight: 1600, maxSizeMB: 0.6, initialQuality: 0.8 },
  "listing-thumb": { maxWidthOrHeight: 480, maxSizeMB: 0.1, initialQuality: 0.75 },
  vehicle360: { maxWidthOrHeight: 1024, maxSizeMB: 0.3, initialQuality: 0.82 },
  "ai-identify": {
    maxWidthOrHeight: 480,
    maxSizeMB: 0.12,
    initialQuality: 0.75,
    fileType: "image/jpeg",
    alwaysUseCompressed: true,
  },
  "ai-attributes": {
    maxWidthOrHeight: 768,
    maxSizeMB: 0.12,
    initialQuality: 0.75,
    fileType: "image/jpeg",
    alwaysUseCompressed: true,
  },
};
