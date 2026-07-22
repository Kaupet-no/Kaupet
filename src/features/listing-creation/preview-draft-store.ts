import { useSyncExternalStore } from "react";

import type { ListingDetailViewCategory } from "@/components/listing-detail/listing-detail-view";

/**
 * In-memory (not persisted, not serialized) handoff of the current wizard
 * draft to the `/ny-annonse/forhandsvisning` route. Images only exist as
 * local blob URLs before publish, so the draft can't round-trip through
 * Supabase or localStorage — it only has to survive a same-tab client-side
 * navigation, which a module-scoped store does trivially.
 */
export type PreviewDraft = {
  title: string;
  subtitle: string | null;
  description: string;
  priceNok: number | null;
  isFree: boolean;
  condition: string | null;
  city: string | null;
  postalCode: string | null;
  displayLat: number | null;
  displayLng: number | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  images: { storage_path: string; sort_order: number }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
};

let currentDraft: PreviewDraft | null = null;
const listeners = new Set<() => void>();

export function setPreviewDraft(draft: PreviewDraft) {
  currentDraft = draft;
  listeners.forEach((l) => l());
}

export function clearPreviewDraft() {
  currentDraft = null;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentDraft;
}

export function usePreviewDraft(): PreviewDraft | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
