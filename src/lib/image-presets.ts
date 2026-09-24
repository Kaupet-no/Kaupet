// Miljønøytral definisjon av bildekomprimeringspresetene. Ingen imports her
// (verken klient- eller serverbibliotek), slik at både klientkomprimeringen
// (`image-compression.ts`, kjører i nettleseren via `browser-image-compression`)
// og serverkomprimeringen (`image-compression.server.ts`, kjører via
// Cloudflare Images-bindingen for bilder hentet via Excel-/API-/MCP-synk) leser
// nøyaktig samme tall. Uten denne delingen kunne de to komprimeringsveiene
// drive fra hverandre og gi ulikt resultat for "samme" bilde — noe brukeren
// eksplisitt har krevd at IKKE skal skje. Se
// /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md, fase 3.

export type CompressPreset = "avatar" | "listing" | "listing-thumb" | "vehicle360";

export type PresetConfig = {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  initialQuality: number;
};

// Avatarer rendres lite (~80px) og kan komprimeres hardt. Annonsebilder trenger
// høyere oppløsning, men kan fortsatt skaleres betraktelig ned fra originalen.
// 360-frames vises kun små/animert i spin-visningen, aldri i full skjerm
// enkeltvis — komprimeres derfor hardere enn galleribilder. "listing-thumb"
// er den lille varianten som vises på annonsekort i søk/favoritter/etc.
export const PRESETS: Record<CompressPreset, PresetConfig> = {
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.15, initialQuality: 0.7 },
  listing: { maxWidthOrHeight: 1600, maxSizeMB: 0.6, initialQuality: 0.8 },
  "listing-thumb": { maxWidthOrHeight: 480, maxSizeMB: 0.1, initialQuality: 0.75 },
  vehicle360: { maxWidthOrHeight: 1024, maxSizeMB: 0.3, initialQuality: 0.82 },
};
