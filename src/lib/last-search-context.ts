const STORAGE_KEY = "kaupet:lastAnnonserSearch";

export interface LastSearchContext {
  search: Record<string, unknown>;
  label: string;
}

export function saveLastSearchContext(ctx: LastSearchContext) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // sessionStorage unavailable (e.g. private mode) — ignore, fallback handles it
  }
}

export function readLastSearchContext(): LastSearchContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSearchContext;
  } catch {
    return null;
  }
}
