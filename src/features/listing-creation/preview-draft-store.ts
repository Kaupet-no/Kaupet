import type { ListingDetailViewCategory } from "@/components/listing-detail/listing-detail-view";

/**
 * Shape of the wizard draft handed to `PreviewDraftView`. Images only exist
 * as local blob URLs before publish, so this can't round-trip through
 * Supabase or localStorage — it's just local component state in
 * ny-annonse.tsx, passed straight down as a prop.
 */
export type PreviewDraft = {
  title: string;
  subtitle: string | null;
  description: string;
  priceNok: number | null;
  isFree: boolean;
  condition: string | null;
  canShip: boolean | null;
  requiresDeliveryMethod: boolean;
  city: string | null;
  postalCode: string | null;
  displayLat: number | null;
  displayLng: number | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  categoryId: string | null;
  images: { storage_path: string; sort_order: number; caption?: string | null }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
};

export type PreviewDraftInput = {
  title: string;
  subtitle: string | null | undefined;
  description: string;
  isFree: boolean;
  validPriceNok: number | null;
  fieldGroupKeys: readonly string[];
  condition: string | null | undefined;
  requiresDeliveryMethod: boolean;
  canShip: string | null | undefined;
  city: string | null | undefined;
  postalCode: string | null | undefined;
  coords: { lat: number; lng: number } | null | undefined;
  isVehicle: boolean;
  knownIssues: string | null | undefined;
  noKnownIssues: boolean | null | undefined;
  maintenanceHistory: string | null | undefined;
  categoryId: string | null | undefined;
  categoryNode: { name_nb: string; slug?: string | null } | undefined;
  images: { caption?: string | null; previewUrl: string }[];
  attributes: Record<string, unknown>;
};

export function buildPreviewDraft(i: PreviewDraftInput): PreviewDraft {
  return {
    title: i.title,
    subtitle: i.subtitle || null,
    description: i.description,
    priceNok: i.isFree ? null : i.validPriceNok,
    isFree: i.isFree,
    condition: i.fieldGroupKeys.includes("condition") ? (i.condition ?? null) : null,
    canShip: i.requiresDeliveryMethod && i.canShip != null ? i.canShip !== "pickup" : null,
    requiresDeliveryMethod: i.requiresDeliveryMethod,
    city: i.city || null,
    postalCode: i.postalCode || null,
    displayLat: i.coords?.lat ?? null,
    displayLng: i.coords?.lng ?? null,
    knownIssues: i.isVehicle ? i.knownIssues || null : null,
    noKnownIssues: i.isVehicle ? !!i.noKnownIssues : null,
    maintenanceHistory: i.isVehicle ? i.maintenanceHistory || null : null,
    category: i.categoryNode
      ? { name_nb: i.categoryNode.name_nb, slug: i.categoryNode.slug ?? null }
      : null,
    categoryId: i.categoryId ?? null,
    images: i.images.map((img, idx) => ({
      storage_path: String(idx),
      sort_order: idx,
      caption: img.caption?.trim() || null,
    })),
    imgUrls: Object.fromEntries(i.images.map((img, idx) => [String(idx), img.previewUrl])),
    attributes: i.attributes,
  };
}
