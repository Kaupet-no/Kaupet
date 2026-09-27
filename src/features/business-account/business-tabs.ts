/** Hvilke faner i bedriftskonsollet en bruker får se. Samme regel brukes både
 * for fanelisten og for å sende en direkte lenke (`?tab=`) til «oversikt» når
 * brukeren ikke har tilgang. */
export function isBusinessTabVisible(
  tab: string,
  access: { role: "superuser" | "member"; effectiveProff: boolean },
): boolean {
  if (tab === "brukere" || tab === "integrasjoner") {
    return access.effectiveProff && access.role === "superuser";
  }
  if (tab === "administrer") return access.role === "superuser";
  return true;
}
