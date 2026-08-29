import type { SearchParams } from "@/features/listing-search/search-schema";

const STORAGE_KEY = "kaupet:lastAnnonserSearch";

export interface LastSearchContext {
  search: SearchParams;
  label: string;
}

export function saveLastSearchContext(ctx: LastSearchContext) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // sessionStorage unavailable (e.g. private mode) — ignore, fallback handles it
  }
}

/** Used by the listing detail page's "Tilbake til {label}" link — the last
 * /annonser search this session (if any), so a buyer can return to their
 * exact previous search after viewing a listing instead of starting over.
 * Cleared automatically when the tab closes (sessionStorage), matching what
 * personvern.tsx documents for this key. */
export function readLastSearchContext(): LastSearchContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSearchContext;
  } catch {
    return null;
  }
}
