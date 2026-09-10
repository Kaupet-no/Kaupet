/**
 * Rutene som skjuler global navigasjon i `__root.tsx` — composer-flytene
 * (som har sin egen stegnavigasjon) og de fokuserte enkeltoppgavene.
 */
export function isComposerRoute(pathname: string): boolean {
  return pathname === "/ny-annonse" || pathname === "/ny-ok-annonse";
}

export function isFocusedRoute(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname === "/tilbakestill-passord" ||
    pathname.startsWith("/bekrefter/") ||
    pathname.startsWith("/kvittering/")
  );
}
