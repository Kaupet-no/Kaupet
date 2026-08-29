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
