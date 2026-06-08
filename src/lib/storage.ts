import { supabase } from "@/integrations/supabase/client";

export const LISTING_BUCKET = "listing-images";
export const MAX_IMAGES = 8;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageValidationError =
  | { kind: "too-many"; allowed: number }
  | { kind: "too-large"; name: string; bytes: number }
  | { kind: "bad-type"; name: string; type: string };

export function validateImages(files: File[], existingCount = 0): ImageValidationError | null {
  if (files.length + existingCount > MAX_IMAGES) {
    return { kind: "too-many", allowed: MAX_IMAGES };
  }
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
    case "too-many":
      return `Du kan laste opp maks ${err.allowed} bilder per annonse.`;
    case "too-large":
      return `"${err.name}" er for stor (maks ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`;
    case "bad-type":
      return `"${err.name}" har ikke et støttet format (${err.type}). Bruk JPG, PNG eller WebP.`;
  }
}

export function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export async function uploadListingImage(opts: {
  userId: string;
  listingId: string;
  index: number;
  file: File;
}): Promise<string> {
  const ext = extFromMime(opts.file.type);
  const path = `${opts.userId}/${opts.listingId}/${Date.now()}-${opts.index}.${ext}`;
  const { error } = await supabase.storage.from(LISTING_BUCKET).upload(path, opts.file, {
    contentType: opts.file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signListingImageUrls(
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const need: string[] = [];
  for (const p of paths) {
    const cached = signedUrlCache.get(p);
    if (cached && cached.expiresAt > now + 60_000) {
      result[p] = cached.url;
    } else {
      need.push(p);
    }
  }
  if (need.length > 0) {
    const { data, error } = await supabase.storage
      .from(LISTING_BUCKET)
      .createSignedUrls(need, expiresInSeconds);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        signedUrlCache.set(item.path, {
          url: item.signedUrl,
          expiresAt: now + expiresInSeconds * 1000,
        });
        result[item.path] = item.signedUrl;
      }
    }
  }
  return result;
}
