/** Banneret for feltfeil fra react-hook-form-validering. */
export const FIELD_ERRORS_MESSAGE = "Rett feltene som er markert før du fortsetter.";

/** Banneret skal forsvinne når feilen er rettet — ellers står det igjen etter
 * at feilmeldingen under feltet er borte. `stillInvalid` avgjør det kalleren:
 * feltfeil fra react-hook-form, eller stegvalidatoren som blokkerte kjørt på
 * nytt. Andre meldinger står til de settes på nytt. */
export function visibleErrorSummary(
  message: string | null,
  { hasFieldErrors, stillInvalid }: { hasFieldErrors: boolean; stillInvalid?: boolean },
) {
  if (!message) return null;
  if (stillInvalid !== undefined) return stillInvalid ? message : null;
  if (message === FIELD_ERRORS_MESSAGE) return hasFieldErrors ? message : null;
  return message;
}
