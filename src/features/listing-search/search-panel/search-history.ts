// Nylige søk. Flyttet ut av native-search-overlay.tsx (fase 9) da den filen
// ble erstattet av søkepanelet — nøkkelen er uendret, så brukerens historikk
// overlever byttet.
const HISTORY_KEY = "kaupet_recent_searches_v1";
const MAX_HISTORY = 5;

export function getSearchHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function saveSearchToHistory(q: string): void {
  const trimmed = q.trim();
  if (!trimmed) return;
  try {
    const prev = getSearchHistory().filter((s) => s !== trimmed);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([trimmed, ...prev].slice(0, MAX_HISTORY)));
  } catch {
    /* ignore */
  }
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

// Nylig brukte kategorier (slugs), vist som snarveier over kategorirutenettet.
const RECENT_CATEGORIES_KEY = "kaupet_recent_categories_v1";
const MAX_RECENT_CATEGORIES = 4;

export function getRecentCategories(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function saveRecentCategory(slug: string): void {
  try {
    const prev = getRecentCategories().filter((s) => s !== slug);
    localStorage.setItem(
      RECENT_CATEGORIES_KEY,
      JSON.stringify([slug, ...prev].slice(0, MAX_RECENT_CATEGORIES)),
    );
  } catch {
    /* ignore */
  }
}
