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
  images: { storage_path: string; sort_order: number; caption?: string | null }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
};
