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
