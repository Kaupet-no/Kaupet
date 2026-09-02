import logoDataUri from "@/assets/brand/kaupet-proff-logo.png?inline";

/**
 * Den ekte Kaupet Proff-logoen — samme som `BusinessPlanLogo` viser i
 * planvelgeren og i headeren for innloggede bedriftsbrukere.
 *
 * Excel kan ikke laste webfonter, så komponenten er rendret én gang med de
 * faktiske fontene (Newsreader Variable + Inter Variable) og lagret som
 * PNG i `src/assets/brand/kaupet-proff-logo.png`. Filen er 459×96 px, altså
 * 2× visningsstørrelsen under, så logoen er skarp både på skjerm og utskrift.
 * Endres BusinessPlanLogo, må PNG-en genereres på nytt.
 */
export const PROFF_LOGO = { widthPx: 230, heightPx: 48 } as const;

let cached: Uint8Array | undefined;

export function proffLogoPng(): Uint8Array {
  if (cached) return cached;
  const binary = atob(logoDataUri.slice(logoDataUri.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  cached = bytes;
  return bytes;
}
