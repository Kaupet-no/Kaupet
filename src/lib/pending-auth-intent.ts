export type PendingAuthIntent =
  { type: "favorite"; listingId: string } | { type: "contact"; listingId: string };

const STORAGE_KEY = "kaupet-pending-auth-intent";

export function savePendingAuthIntent(intent: PendingAuthIntent): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Storage can be disabled; returning to the correct page still works.
  }
}

export function takePendingAuthIntent(expected: PendingAuthIntent): boolean {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as Partial<PendingAuthIntent>;
    if (stored.type !== expected.type || stored.listingId !== expected.listingId) return false;
    window.sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
