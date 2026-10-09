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

/** Unscoped legacy drafts have no provable owner and are deliberately left untouched. */
export function draftStorageKey(
  kind: "sell" | "want",
  userId: string | null,
  suffix = "",
  organizationId: string | null = null,
) {
  return `kaupet_draft_${kind}_listing${suffix}:${userId ?? "guest"}:${organizationId ?? "private"}`;
}
