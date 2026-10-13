import type { PendingImage } from "@/components/image-uploader";
import { uploadListingImage, uploadListingImageThumb } from "@/lib/storage";

/** En opplastet kopi av et utkastbilde. `id` blir raden i listing_images. */
export type RemoteImage = {
  id: string;
  path: string;
  uploadedAt: number;
  /** Raden finnes på utkastet, så filen er referert og ryddes ikke bort. */
  synced?: boolean;
};

// Unreferenced uploads can be deleted after 24 hours; leave one hour of margin.
export const UPLOAD_REUSE_TTL_MS = 23 * 60 * 60 * 1000;

/** Opplastingen kan gjenbrukes hvis den tilhører denne annonsen og filen
 * fortsatt finnes. ponytail: `synced` stoler på at ingen annen enhet har
 * fjernet bildet fra utkastet i mellomtiden; da må filen lastes opp på nytt. */
export function reusableRemote(
  image: PendingImage,
  listingId: string,
  now = Date.now(),
): RemoteImage | null {
  const remote = image.remote;
  if (!remote?.path.startsWith(`${listingId}/`)) return null;
  return remote.synced || now - remote.uploadedAt < UPLOAD_REUSE_TTL_MS ? remote : null;
}

/** Laster opp det ferdig komprimerte bildet og miniatyren. Miniatyren er
 * best-effort: kortvisningen faller tilbake til fullstørrelsesbildet. */
export async function uploadDraftImage(
  listingId: string,
  image: PendingImage,
): Promise<RemoteImage> {
  const uploadedAt = Date.now();
  const path = await uploadListingImage({ listingId, file: image.file });
  await uploadListingImageThumb({ path, file: image.thumbFile }).catch((err) =>
    console.warn("Kunne ikke laste opp kort-thumbnail for utkastbilde", err),
  );
  return { id: crypto.randomUUID(), path, uploadedAt };
}
