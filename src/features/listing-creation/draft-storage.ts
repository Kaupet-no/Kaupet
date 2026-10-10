/**
 * Tynne, kast-sikre localStorage-primitiver delt av salgs- og ønskes-kjøpt-
 * utkastene. localStorage kan kaste (QuotaExceeded, blokkert lagring i privat
 * modus), så ingen funksjon her kaster videre.
 */

/** Lokale utkast utløper etter 7 dager. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isDraftFresh(savedAt: number): boolean {
  return Date.now() - savedAt < DRAFT_TTL_MS;
}

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returnerer false når nettleseren avviste skrivingen. */
export function writeItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItems(...keys: string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

// ponytail: engangsopprydding av uskoperte utkast fra før oktober 2026. De har
// ingen bevisbar eier (delt enhet) og gjenopprettes derfor ikke, men skal ikke
// bli liggende. Lokale utkast utløper etter 7 dager, så dette kan slettes snart.
const LEGACY_DRAFT_KEYS = [
  "kaupet_draft_ny_annonse",
  "kaupet_draft_id",
  "kaupet_draft_updated_at",
  "kaupet_draft_sell_listing",
  "kaupet_draft_sell_listing_id",
  "kaupet_draft_sell_listing_updated_at",
  "kaupet_draft_want_listing",
  "kaupet_draft_want_listing_id",
];
export function clearLegacyDrafts(): void {
  removeItems(...LEGACY_DRAFT_KEYS);
}

/** Drafts are scoped per account and business so another actor never adopts them. */
export function draftStorageKey(
  kind: "sell" | "want",
  userId: string | null,
  suffix = "",
  organizationId: string | null = null,
) {
  return `kaupet_draft_${kind}_listing${suffix}:${userId ?? "guest"}:${organizationId ?? "private"}`;
}

/** Keep authenticated guest handoffs separate from existing account drafts. */
export function draftStorageScope(
  kind: "sell" | "want",
  userId: string | null,
  organizationId: string | null,
  resumeGuest: boolean,
): string {
  if (!userId) return "";
  const baseKey = draftStorageKey(kind, userId, "", organizationId);
  const savedAt = (key: string): number => {
    try {
      const draft = JSON.parse(readItem(key) ?? "null");
      return draft && typeof draft.saved_at === "number" && isDraftFresh(draft.saved_at)
        ? draft.saved_at
        : 0;
    } catch {
      return 0;
    }
  };
  const guestSavedAt = resumeGuest ? savedAt(draftStorageKey(kind, null)) : 0;
  if (guestSavedAt) return `:handoff:${guestSavedAt}`;
  let newest = savedAt(baseKey);
  let scope = "";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${baseKey}:handoff:`)) continue;
      const time = savedAt(key);
      if (time > newest) {
        newest = time;
        scope = key.slice(baseKey.length);
      }
    }
  } catch {
    // Unavailable browser storage: the existing save paths report the failure.
  }
  return scope;
}
