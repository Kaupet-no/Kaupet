/** Read provider errors before auth initialization can consume the URL fragment. */
export function authLinkError(search: string, hash: string): string | null {
  const params = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ""))];
  const hasError = params.some(
    (p) => p.has("error") || p.has("error_code") || p.has("error_description"),
  );
  if (!hasError) return null;
  return "Lenken er ugyldig, utløpt eller allerede brukt. Be bedriftens superbruker sende invitasjonen på nytt. Ved passordtilbakestilling kan du be om en ny lenke fra innlogging.";
}

export const initialAuthLinkError =
  typeof window === "undefined"
    ? null
    : authLinkError(window.location.search, window.location.hash);
