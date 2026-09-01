import { supabase } from "@/integrations/supabase/client";

export const LISTING_BUCKET = "listing-images";
export const VEHICLE_360_BUCKET = "listing-360-frames";
export const AVATAR_BUCKET = "avatars";
export const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const ORGANIZATION_LOGOS_BUCKET = "organization-logos";

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
      return `"${err.name}" har ikke et støttet format (${err.type}). Bruk JPG, PNG eller WebP.`;
  }
}

export function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export async function uploadOrganizationLogo(opts: {
  organizationId: string;
  file: File;
}): Promise<string> {
  const validationError = validateImages([opts.file]);
  if (validationError) throw new Error(describeImageError(validationError));
  const ext = extFromMime(opts.file.type);
  const path = `${opts.organizationId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(ORGANIZATION_LOGOS_BUCKET).upload(path, opts.file, {
    contentType: opts.file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deletePreviousOrganizationLogo(
  previousPath: string | null | undefined,
): Promise<void> {
  if (!previousPath) return;
  try {
    await supabase.storage.from(ORGANIZATION_LOGOS_BUCKET).remove([previousPath]);
  } catch {
    // best-effort cleanup after the database points to the new logo
  }
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

// Kort-thumbnailen for et annonsebilde ligger ved siden av originalen under
// samme path med "-thumb" satt inn før filendelsen. Ren navnekonvensjon —
// ingen egen DB-kolonne trengs, og eldre bilder uten thumbnail faller
// naturlig tilbake til fullstørrelsesbildet (se ListingCard).
export function thumbPathFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? `${path.slice(0, dot)}-thumb${path.slice(dot)}` : `${path}-thumb`;
}

export async function uploadListingImageThumb(opts: { path: string; file: File }): Promise<void> {
  const { error } = await supabase.storage
    .from(LISTING_BUCKET)
    .upload(thumbPathFor(opts.path), opts.file, {
      contentType: opts.file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw error;
}

export function validateAvatarImage(file: File): ImageValidationError | null {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return { kind: "bad-type", name: file.name, type: file.type || "ukjent" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { kind: "too-large", name: file.name, bytes: file.size };
  }
  return null;
}

export async function uploadAvatarImage(opts: { userId: string; file: File }): Promise<string> {
  const ext = extFromMime(opts.file.type);
  const path = `${opts.userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, opts.file, {
    contentType: opts.file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return publicUrl;
}

// Avatar uploads use timestamped filenames, so the previous file is never
// implicitly overwritten — call this after a successful re-upload (and DB
// update) to avoid leaving orphaned files behind. Best-effort: failures are
// swallowed since the new avatar is already live either way.
export async function deletePreviousAvatarImage(previousPublicUrl: string | null | undefined) {
  if (!previousPublicUrl) return;
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = previousPublicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = previousPublicUrl.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // best-effort cleanup
  }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

let pendingBatch: { paths: Set<string>; promise: Promise<void> } | null = null;

async function flushSignedUrlBatch(expiresInSeconds: number) {
  const batch = pendingBatch;
  pendingBatch = null;
  if (!batch) return;
  const now = Date.now();
  const { data, error } = await supabase.storage
    .from(LISTING_BUCKET)
    .createSignedUrls(Array.from(batch.paths), expiresInSeconds);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) {
      signedUrlCache.set(item.path, {
        url: item.signedUrl,
        expiresAt: now + expiresInSeconds * 1000,
      });
    }
  }
}

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
    // Batches every call made within the same tick (e.g. one per
    // ListingCard on a results grid, each firing its own effect on mount)
    // into a single createSignedUrls request instead of one per caller.
    if (!pendingBatch) {
      pendingBatch = {
        paths: new Set(),
        promise: Promise.resolve().then(() => flushSignedUrlBatch(expiresInSeconds)),
      };
    }
    for (const p of need) pendingBatch.paths.add(p);
    await pendingBatch.promise;
    for (const p of need) {
      const cached = signedUrlCache.get(p);
      if (cached) result[p] = cached.url;
    }
  }
  return result;
}

export async function uploadMessageAttachment(opts: {
  conversationId: string;
  file: File;
}): Promise<string> {
  const ext = extFromMime(opts.file.type);
  const path = `${opts.conversationId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(path, opts.file, {
      contentType: opts.file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

const signedMessageAttachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signMessageAttachmentUrls(
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Record<string, string>> {
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
  if (need.length > 0) {
    const { data, error } = await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .createSignedUrls(need, expiresInSeconds);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        signedMessageAttachmentUrlCache.set(item.path, {
          url: item.signedUrl,
          expiresAt: now + expiresInSeconds * 1000,
        });
        result[item.path] = item.signedUrl;
      }
    }
  }
  return result;
}

const signed360UrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signVehicle360FrameUrls(
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const need: string[] = [];
  for (const p of paths) {
    const cached = signed360UrlCache.get(p);
    if (cached && cached.expiresAt > now + 60_000) {
      result[p] = cached.url;
    } else {
      need.push(p);
    }
  }
  if (need.length > 0) {
    const { data, error } = await supabase.storage
      .from(VEHICLE_360_BUCKET)
      .createSignedUrls(need, expiresInSeconds);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        signed360UrlCache.set(item.path, {
          url: item.signedUrl,
          expiresAt: now + expiresInSeconds * 1000,
        });
        result[item.path] = item.signedUrl;
      }
    }
  }
  return result;
}
