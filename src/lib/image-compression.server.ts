// Serverside bildekomprimering for bilder hentet via Excel-/API-/MCP-synk
// (`listing-image-jobs.server.ts`). Skal gi SAMME resultat som veiviserens
// klientkomprimering (`image-compression.ts`): WebP, samme maks bredde/høyde,
// samme kvalitetsmål — begge leser `PRESETS` fra den delte, miljønøytrale
// `image-presets.ts` slik at parameterne aldri kan drive fra hverandre.
//
// Selve transformasjonen (nedskalering + WebP-enkoding) kan ikke gjøres i ren
// JS på Cloudflare Workers (ingen canvas/libvips), så den delegeres til
// Cloudflare Images-bindingen via `ImageTransformer`-grensesnittet under.
// Grensesnittet finnes for å gjøre komprimeringslogikken testbar uten
// bindingen (se image-compression.server.test.ts, som bruker en fake
// transformer) og for å holde selve algoritmen (retry/kvalitetsjustering/
// "behold minste") uavhengig av hvordan transformasjonen faktisk utføres.
//
// **Kjernekrav fra bruker: mål-størrelse er et mål, ikke et krav.** Akkurat
// som `browser-image-compression` i nettleseren, skal denne funksjonen ALDRI
// kaste en kundefeil fordi resultatet ikke ble mindre enn preset-ets
// `maxSizeMB`. Etter maks antall forsøk beholdes det beste (minste) resultatet
// funnet, så lenge det er innenfor selve lagringsgrensen (5 MB, se
// `MAX_FILE_BYTES` i `storage.ts`) — se `listing-image-jobs.server.ts` for
// hvordan et resultat som likevel skulle overskride det (i praksis så godt
// som umulig for et WebP på maks 1600 px) klassifiseres som en intern feil,
// ikke en kundefeil.

import { PRESETS, type CompressPreset } from "@/lib/image-presets";
import { MAX_FILE_BYTES } from "@/lib/storage";
import { cancelResponseBody, readResponseBytes, withHttpDeadline } from "@/lib/http-bounded.server";

export type ServerImage = { bytes: Uint8Array; contentType: string };

export type ServerCompressionResult = {
  main: ServerImage;
  thumb: ServerImage;
  /** Totalt antall Cloudflare Images-transformasjoner brukt for dette
   * bildet (hovedbilde + thumbnail), til bruk i kostnadstelling
   * (se plandokumentets fase 3 om gratisnivået på 5 000 transformasjoner/mnd). */
  transformations: number;
};

/** Kastes av en `ImageTransformer`-implementasjon når INPUT-bildet selv er
 * skadet/ikke lesbart som bilde (f.eks. Cloudflare Images's dekodefeil).
 * Dette er den ENESTE feilen fra transformeren som skal bli en kundefeil
 * («Bildet kunne ikke leses (skadet fil)») — alt annet transformeren kaster
 * (bindingen mangler, kvote brukt opp, tjenesten nede) er en intern feil som
 * skal gi retry, ikke en kundefeil. Se listing-image-jobs.server.ts. */
export class ImageDecodeError extends Error {
  constructor(message = "Bildet kunne ikke dekodes") {
    super(message);
    this.name = "ImageDecodeError";
  }
}

/** Kastes når selve transformasjonstjenesten (Cloudflare Images-bindingen)
 * ikke er tilgjengelig i dette kjøremiljøet (lokal dev, vitest, CI). Dette er
 * ALLTID en intern feil — jobben skal bli stående/utsatt, aldri feile for
 * kunden fordi vi mangler bindingen i et gitt miljø. */
export class ImagesUnavailableError extends Error {
  constructor(message = "Cloudflare Images-bindingen er ikke tilgjengelig i dette miljøet") {
    super(message);
    this.name = "ImagesUnavailableError";
  }
}

export type TransformInput = {
  bytes: Uint8Array;
  contentType: string;
  maxWidthOrHeight: number;
  /** 1–100, som Cloudflare Images' `output({ quality })`. */
  quality: number;
};

/** Grensesnittet komprimeringslogikken bruker for selve nedskalering +
 * WebP-enkoding. Én implementasjon i produksjon (`CloudflareImagesTransformer`
 * under), én fake i tester. */
export interface ImageTransformer {
  transform(input: TransformInput): Promise<ServerImage>;
}

// Bilder lagres bare når Cloudflare Images har dekodet og re-enkodet dem.
// Formatstøtte utover leverandørens dokumenterte inputformater er ikke antatt;
// særlig JPEG XL kan derfor feile lukket med en dekodefeil.
//
// Minimal, lokal deklarasjon av `cloudflare:workers`-modulen: `wrangler`s
// medfølgende typer dekker ikke nødvendigvis Images-bindingen i alle
// versjoner, og repoet unngår bevisst tunge typeavhengigheter for dette ene
// grensesnittet (se wrangler.jsonc for selve bindingskonfigurasjonen).
type CloudflareImageOutputResult = { response(): Response };
type CloudflareImageTransformHandle = {
  output(opts: { format: string; quality: number }): Promise<CloudflareImageOutputResult>;
};
// Denne typen er duplisert (samme form) i src/lib/cloudflare-workers.d.ts,
// den ambiente typedeklarasjonen for `cloudflare:workers`-modulspesifikatoren
// — den må stå i en egen, ikke-modul .d.ts-fil, siden TypeScripts
// "Bundler"-modulopplegg ikke godtar `declare module` for en ukjent
// spesifikator inne i en vanlig .ts-fil med imports/exports (det blir tolket
// som en augmentation av en allerede eksisterende modul).
type CloudflareImagesBinding = {
  input(stream: ReadableStream): {
    transform(opts: {
      width: number;
      height: number;
      fit: "scale-down";
    }): CloudflareImageTransformHandle;
  };
};

/** Kaller Cloudflare Images-bindingen (`env.IMAGES`, satt opp i wrangler.jsonc).
 * Lokalt Vite-dev emulerer bindingen via sin dev-plugin; vitest og CI importerer
 * `cloudflare:workers` enten ikke i det hele tatt, eller gir et objekt uten
 * `IMAGES`. Begge tilfeller
 * kastes som `ImagesUnavailableError` (intern feil), ALDRI en krasj eller en
 * kundefeil — se klassekommentaren. */
export class CloudflareImagesTransformer implements ImageTransformer {
  async transform(input: TransformInput): Promise<ServerImage> {
    let images: CloudflareImagesBinding | undefined;
    try {
      const workers = await import("cloudflare:workers");
      images = workers.env?.IMAGES;
    } catch {
      images = undefined;
    }
    if (!images) throw new ImagesUnavailableError();

    return withHttpDeadline(15_000, async (signal) => {
      let response: Response;
      try {
        const stream = new Blob([input.bytes as BlobPart], { type: input.contentType }).stream();
        const result = await images
          .input(stream)
          .transform({
            width: input.maxWidthOrHeight,
            height: input.maxWidthOrHeight,
            fit: "scale-down",
          })
          .output({ format: "image/webp", quality: input.quality });
        response = result.response();
        if (signal.aborted) {
          cancelResponseBody(response);
          throw new Error("Cloudflare Images deadline exceeded");
        }
      } catch (cause) {
        const code =
          typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
        if (typeof code === "number" && [9412, 9413, 9520].includes(code)) {
          throw new ImageDecodeError();
        }
        throw cause instanceof Error ? cause : new Error(String(cause));
      }
      if (!response.ok) {
        cancelResponseBody(response);
        throw new Error(`Cloudflare Images svarte med HTTP ${response.status}`);
      }
      if (
        (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !==
        "image/webp"
      ) {
        cancelResponseBody(response);
        throw new Error("Cloudflare Images returnerte ikke WebP");
      }
      const bytes = await readResponseBytes(response, MAX_FILE_BYTES, signal);
      if (
        bytes.byteLength < 12 ||
        String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
        String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP"
      ) {
        throw new Error("Cloudflare Images returnerte ugyldige WebP-data");
      }
      return { bytes, contentType: "image/webp" };
    });
  }
}

const MAX_ATTEMPTS_MAIN = 2;
const MAX_ATTEMPTS_THUMB = 1;
// Summen (2 + 1) er selve "maks 3 transformasjoner per bilde totalt inkl.
// thumb" fra planen — et hardt tak på Cloudflare Images-forbruket. Se
// transformations-feltet i resultatet for faktisk telling (kan bli lavere,
// f.eks. 2, hvis hovedbildet treffer måltørrelsen på første forsøk).

/** Kjør opptil `maxAttempts` transformasjoner for én preset, senk kvaliteten
 * mellom forsøkene, og behold det minste transformer-resultatet. Originalen
 * blir aldri lagret uten dekoding og re-enkoding.
 * Kaster videre `ImageDecodeError`/`ImagesUnavailableError` fra det
 * FØRSTE forsøket uendret (input er per definisjon ubrukelig da), men
 * svelger feil på senere forsøk og beholder det beste vi allerede har. */
async function compressWithPreset(
  original: ServerImage,
  preset: CompressPreset,
  maxAttempts: number,
  transformer: ImageTransformer,
): Promise<{ result: ServerImage; transformations: number }> {
  const cfg = PRESETS[preset];
  const maxBytes = cfg.maxSizeMB * 1024 * 1024;
  let best: ServerImage | undefined;
  let quality = Math.round(cfg.initialQuality * 100);
  let transformations = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let candidate: ServerImage;
    try {
      candidate = await transformer.transform({
        bytes: original.bytes,
        contentType: original.contentType,
        maxWidthOrHeight: cfg.maxWidthOrHeight,
        quality,
      });
    } catch (cause) {
      if (attempt === 0) throw cause;
      break; // Senere forsøk: behold beste kjente resultat i stedet for å feile jobben.
    }
    transformations += 1;
    if (!best || candidate.bytes.byteLength < best.bytes.byteLength) best = candidate;
    if (candidate.bytes.byteLength <= maxBytes) break;
    quality = Math.max(20, quality - 25);
  }

  if (!best) throw new Error("Bilde kunne ikke transformeres");
  return { result: best, transformations };
}

/**
 * Komprimerer et bilde til `listing`- og `listing-thumb`-preset (samme
 * PRESETS som veiviseren, se image-presets.ts). Godtar alltid et resultat så
 * lenge det er ≤ lagringsgrensen (`MAX_FILE_BYTES`, 5 MB) — treffer aldri en
 * kundefeil for at målstørrelsen (`maxSizeMB`) ikke ble nådd.
 *
 * Kaster videre `ImageDecodeError` (skadet/ulesbart bilde → kundefeil hos
 * kalleren) og `ImagesUnavailableError`/andre feil (→ intern feil, retry) fra
 * transformerens FØRSTE forsøk uendret.
 */
export async function compressListingImageOnServer(
  bytes: Uint8Array,
  contentType: string,
  transformer: ImageTransformer,
): Promise<ServerCompressionResult> {
  const original: ServerImage = { bytes, contentType };

  const mainOutcome = await compressWithPreset(original, "listing", MAX_ATTEMPTS_MAIN, transformer);
  const thumbOutcome = await compressWithPreset(
    original,
    "listing-thumb",
    MAX_ATTEMPTS_THUMB,
    transformer,
  );

  const transformations = mainOutcome.transformations + thumbOutcome.transformations;

  // Lagringsgrensen (5 MB) er en hard grense uavhengig av preset-ets
  // maxSizeMB-MÅL — i praksis nås aldri dette for et WebP på maks 1600 px,
  // men vi sjekker eksplisitt i stedet for å anta det stille. Dette skal
  // klassifiseres som en INTERN feil av kalleren (retry), ikke en kundefeil:
  // det er en begrensning i komprimeringen vår, ikke noe kunden kan rette.
  if (mainOutcome.result.bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `Komprimert hovedbilde (${mainOutcome.result.bytes.byteLength} bytes) overskrider lagringsgrensen på ${MAX_FILE_BYTES} bytes`,
    );
  }
  if (thumbOutcome.result.bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `Komprimert miniatyrbilde (${thumbOutcome.result.bytes.byteLength} bytes) overskrider lagringsgrensen på ${MAX_FILE_BYTES} bytes`,
    );
  }

  return { main: mainOutcome.result, thumb: thumbOutcome.result, transformations };
}
