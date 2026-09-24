/** Måler tid brukt i annonseopprettelsesflyten (V6 — median tid til
 * publisert). Ingen personopplysninger: kun tidsstempler i sessionStorage,
 * ryddet ved publisering. */

const FLOW_STARTED_AT_KEY = "kaupet_ny_annonse_started_at";

/** Henter (eller setter, ved første kall i økten) tidspunktet flyten startet.
 * Lagres i sessionStorage slik at et sideoppfriskning midt i flyten ikke
 * nullstiller måleren, men en ny fane/økt starter på nytt. */
export function getOrStartFlowTimer(now: number = Date.now()): number {
  if (typeof window === "undefined") return now;
  try {
    const stored = window.sessionStorage.getItem(FLOW_STARTED_AT_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) return parsed;
    }
    window.sessionStorage.setItem(FLOW_STARTED_AT_KEY, String(now));
  } catch {
    // sessionStorage utilgjengelig (privat modus e.l.) — mål likevel innenfor
    // denne komponentinstansen ved å returnere now.
  }
  return now;
}

export function clearFlowTimer(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FLOW_STARTED_AT_KEY);
  } catch {
    // no-op
  }
}

/** Varighet fra flow-start til nå, avrundet til nærmeste sekund (i ms). */
export function computeDurationMs(startedAt: number, now: number = Date.now()): number {
  const elapsedMs = Math.max(0, now - startedAt);
  return Math.round(elapsedMs / 1000) * 1000;
}
