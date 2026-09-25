// Klientside-komprimering av bilder før opplasting. Sparer både lagringsplass
// og brukernes opplastingsbåndbredde. Biblioteket håndterer EXIF-rotasjon
// (viktig for mobilbilder), nedskalering og kjører i en web worker slik at UI
// ikke blokkeres. Utdata er WebP for opplasting og JPEG for KI-miniatyrer (se
// presetene i image-presets.ts).

import imageCompression from "browser-image-compression";
// Workeren gjør `importScripts(libURL)`. Uten egen `libURL` henter biblioteket
// seg selv fra cdn.jsdelivr.net, som CSP-ens `script-src` blokkerer. Da faller
// det stille tilbake til hovedtråden, eller feiler, og KI-miniatyrene forkastes.
// Serveres derfor fra eget domene (dekket av `script-src 'self'` og
// `worker-src 'self' blob:` i security-headers.ts).
import imageCompressionLibUrl from "browser-image-compression/dist/browser-image-compression.js?url";

import { PRESETS } from "@/lib/image-presets";
export type { CompressPreset } from "@/lib/image-presets";
import type { CompressPreset } from "@/lib/image-presets";

function toPresetFileName(name: string, fileType: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = fileType === "image/jpeg" ? "jpg" : "webp";
  return `${base}.${ext}`;
}

/**
 * Komprimer og nedskaler et bilde til presetets format. Fail-safe: hvis
 * komprimeringen feiler, eller resultatet blir større enn originalen, returneres
 * originalfilen uendret — opplasting skal aldri brytes av komprimeringssteget.
 * Unntak: presets med `alwaysUseCompressed` (KI-miniatyrer) bruker alltid den
 * re-enkodede filen. `preserveExif` sendes alltid eksplisitt som `false`.
 */
export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  const cfg = PRESETS[preset];
  const fileType = cfg.fileType ?? "image/webp";
  let result = file;
  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: cfg.maxWidthOrHeight,
      maxSizeMB: cfg.maxSizeMB,
      initialQuality: cfg.initialQuality,
      fileType,
      preserveExif: false,
      useWebWorker: true,
      // Absolutt URL: workeren er en blob:-URL som ikke kan resolve relative
      // stier. `import.meta.url` (ikke `location`) så dette ikke kaster i
      // Node-testmiljø og stille sender alle tester til catch-grenen.
      libURL: new URL(imageCompressionLibUrl, import.meta.url).href,
    });
    // Behold den minste av original og komprimert.
    if (cfg.alwaysUseCompressed || compressed.size < file.size) {
      result = new File([compressed], toPresetFileName(file.name, fileType), {
        type: fileType,
        lastModified: Date.now(),
      });
    }
  } catch (err) {
    console.warn("Bildekomprimering feilet, laster opp original", err);
  }

  return result;
}
