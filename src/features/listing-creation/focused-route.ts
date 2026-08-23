export function isFocusedRoute(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname === "/tilbakestill-passord" ||
    pathname.startsWith("/bekrefter/") ||
    pathname.startsWith("/kvittering/")
  );
}
