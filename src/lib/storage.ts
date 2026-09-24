import { publicImageUrl } from "@/lib/image-url";
import {
  deleteListingImage as deleteListingImageFn,
  deletePreviousAvatarImage as deletePreviousAvatarImageFn,
  deletePreviousOrganizationLogo as deletePreviousOrganizationLogoFn,
  signMessageAttachmentUrls as signMessageAttachmentUrlsFn,
  uploadAvatarImage as uploadAvatarImageFn,
  uploadListingImage as uploadListingImageFn,
  uploadListingImageThumb as uploadListingImageThumbFn,
  uploadMessageAttachment as uploadMessageAttachmentFn,
  uploadOrganizationLogo as uploadOrganizationLogoFn,
} from "@/lib/storage.functions";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_LISTING_IMAGES = 20;
// Må matche `.max(...)` på `paths` i signMessageAttachmentUrls-validatoren i
// storage.functions.ts.
export const MAX_ATTACHMENT_PATHS_PER_REQUEST = 100;
// Delt med `presignGetUrl`-kallet i storage.functions.ts, slik at
// klientcachens TTL aldri kommer i utakt med den faktiske utløpstiden på den
// signerte URL-en.
export const ATTACHMENT_URL_TTL_SECONDS = 60 * 60;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/jxl"] as const;
export const IMAGE_ACCEPT = `${ALLOWED_MIME.join(",")},.jxl`;

export type ImageValidationError =
  | { kind: "too-large"; name: string; bytes: number }
  | { kind: "bad-type"; name: string; type: string };

export function validateImages(files: File[]): ImageValidationError | null {
  for (const f of files) {
    if (!ALLOWED_MIME.includes(f.type as (typeof ALLOWED_MIME)[number])) {
      return { kind: "bad-type", name: f.name, type: f.type || "ukjent" };
    }
    if (f.size > MAX_FILE_BYTES) {
      return { kind: "too-large", name: f.name, bytes: f.size };
    }
  }
  return null;
}

export function describeImageError(err: ImageValidationError): string {
  switch (err.kind) {
    case "too-large":
      return `"${err.name}" er for stor (maks ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`;
    case "bad-type":
      return `"${err.name}" har ikke et støttet format (${err.type}). Bruk JPG, PNG, WebP eller JPEG XL.`;
  }
}

export function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jxl") return "jxl";
  return "bin";
}

export function validateAvatarImage(file: File): ImageValidationError | null {
  return validateImages([file]);
}

// Kort-thumbnailen for et annonsebilde ligger ved siden av originalen under
// samme path med "-thumb" satt inn før filendelsen. Ren navnekonvensjon —
// ingen egen DB-kolonne trengs, og eldre bilder uten thumbnail faller
// naturlig tilbake til fullstørrelsesbildet (se ListingCard).
export function thumbPathFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? `${path.slice(0, dot)}-thumb${path.slice(dot)}` : `${path}-thumb`;
}

// Tynne klientwrappere rundt storage.functions.ts — selve opplastingen (og
// autorisasjonssjekken) skjer på serveren, siden R2-tilgangsnøklene aldri må
// nå klienten. Se storage.functions.ts for detaljene rundt nøkkelskjema og
// tilgangskontroll.

/** Nøkkelskjema `{listingId}/{uuid}.{ext}` — se storage.functions.ts. Bygges
 * på serveren fra verifiserte verdier, aldri fra klientinput. */
export async function uploadListingImage(opts: { listingId: string; file: File }): Promise<string> {
  const formData = new FormData();
  formData.append("listingId", opts.listingId);
  formData.append("file", opts.file);
  const { path } = await uploadListingImageFn({ data: formData });
  return path;
}

export async function uploadListingImageThumb(opts: { path: string; file: File }): Promise<void> {
  const formData = new FormData();
  formData.append("path", opts.path);
  formData.append("file", opts.file);
  await uploadListingImageThumbFn({ data: formData });
}

export async function deleteListingImage(path: string): Promise<void> {
  await deleteListingImageFn({ data: { path } });
}

export async function uploadAvatarImage(opts: { file: File }): Promise<string> {
  const formData = new FormData();
  formData.append("file", opts.file);
  const { url } = await uploadAvatarImageFn({ data: formData });
  return url;
}

// Avatar uploads får en ny, unik nøkkel per opplasting, så den forrige filen
// overskrives aldri implisitt — kall denne etter en vellykket re-opplasting
// (og DB-oppdatering) for å unngå foreldreløse filer. Best-effort: feil
// svelges siden den nye avataren allerede er live uansett.
export async function deletePreviousAvatarImage(
  previousPublicUrl: string | null | undefined,
): Promise<void> {
  await deletePreviousAvatarImageFn({ data: { previousPublicUrl: previousPublicUrl ?? null } });
}

export async function uploadOrganizationLogo(opts: {
  organizationId: string;
  file: File;
  kind?: "logo" | "contact";
}): Promise<string> {
  const formData = new FormData();
  formData.append("organizationId", opts.organizationId);
  formData.append("file", opts.file);
  if (opts.kind) formData.append("kind", opts.kind);
  const { path } = await uploadOrganizationLogoFn({ data: formData });
  return path;
}

export async function deletePreviousOrganizationLogo(
  previousPath: string | null | undefined,
): Promise<void> {
  await deletePreviousOrganizationLogoFn({ data: { previousPath: previousPath ?? null } });
}

function publicUrlsFor(paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, publicImageUrl(path)]));
}

// Annonsebilder ligger i en offentlig R2-bucket (se docs/ARCHITECTURE.md), så
// URL-en kan bygges syntaktisk uten signering, cache eller nettverkskall.
export function signListingImageUrls(paths: string[]): Record<string, string> {
  return publicUrlsFor(paths);
}

// 360-bilder ligger i samme offentlige R2-bucket som annonsebilder (se
// docs/ARCHITECTURE.md), så URL-en bygges syntaktisk her også.
export function signVehicle360FrameUrls(paths: string[]): Record<string, string> {
  return publicUrlsFor(paths);
}

/** Nøkkelskjema `{conversationId}/{uuid}.{ext}` — se storage.functions.ts.
 * Bygges på serveren, aldri fra klientinput. Vedlegget ligger i den private
 * VEDLEGG-bucketen (se signMessageAttachmentUrls for lesevei). */
export async function uploadMessageAttachment(opts: {
  conversationId: string;
  file: File;
}): Promise<string> {
  const formData = new FormData();
  formData.append("conversationId", opts.conversationId);
  formData.append("file", opts.file);
  const { path } = await uploadMessageAttachmentFn({ data: formData });
  return path;
}

const signedMessageAttachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();
let messageAttachmentCacheGeneration = 0;

// Meldingsvedlegg ligger i den private VEDLEGG-bucketen (se
// storage.functions.ts), så URL-en må presigneres server-side per kall —
// i motsetning til annonsebilder og 360-bilder, som ligger i den offentlige
// bucketen og kan bygges syntaktisk. Cachen unngår å be om ny signatur for
// vedlegg vi nylig har fått URL for.
export async function signMessageAttachmentUrls(paths: string[]): Promise<Record<string, string>> {
  const generation = messageAttachmentCacheGeneration;
  const now = Date.now();
  const result: Record<string, string> = {};
  const need: string[] = [];
  for (const p of paths) {
    const cached = signedMessageAttachmentUrlCache.get(p);
    if (cached && cached.expiresAt > now + 60_000) {
      result[p] = cached.url;
    } else {
      need.push(p);
    }
  }
  // Serverens validator avviser mer enn MAX_ATTACHMENT_PATHS_PER_REQUEST stier
  // i én forespørsel — del opp her, ellers feiler ALLE vedleggene i en tråd
  // med mange bilder, ikke bare de utover grensen.
  for (let i = 0; i < need.length; i += MAX_ATTACHMENT_PATHS_PER_REQUEST) {
    const chunk = need.slice(i, i + MAX_ATTACHMENT_PATHS_PER_REQUEST);
    const urls = await signMessageAttachmentUrlsFn({ data: { paths: chunk } });
    for (const [path, url] of Object.entries(urls)) {
      if (generation !== messageAttachmentCacheGeneration) continue;
      signedMessageAttachmentUrlCache.set(path, {
        url,
        expiresAt: now + ATTACHMENT_URL_TTL_SECONDS * 1000,
      });
      result[path] = url;
    }
  }
  return result;
}

/** Drop account-bound signed message-attachment URLs when auth state
 * changes. Meldingsvedlegg er fortsatt en privat, signert bucket (egen
 * senere fase) — annonsebilder og 360-bilder trenger ikke lenger denne
 * opprydningen siden de nå er rene, offentlige URL-er uten tilstand å tømme. */
export function clearMessageAttachmentUrlCache(): void {
  signedMessageAttachmentUrlCache.clear();
  messageAttachmentCacheGeneration += 1;
}
