/**
 * Norske bindeord som naturlig knytter gjenstand og egenskap sammen i
 * søkefraser ("bil MED skinnseter", "sko TIL dame") men som ingen
 * annonsetekst noensinne inneholder som eget søkeord — når resten av
 * frasen allerede er tolket som strukturerte filtre (kategori, utstyr,
 * tall), blir disse stående igjen som bokstavelige fritekst-AND-krav og
 * gir falske nulltreff. Kun ment å kjøres *etter* et annet vellykket
 * treff har trukket ut sin del av frasen, aldri på en søketekst der
 * ingenting annet ble gjenkjent.
 */
const STOPWORDS = new Set([
  "med",
  "og",
  "for",
  "til",
  "i",
  "på",
  "av",
  "en",
  "ei",
  "et",
  "den",
  "det",
]);

/** Fjerner bindeord fra en søketekst, ord for ord (case-insensitive, hele
 * ord). Faller tilbake til den opprinnelige teksten hvis strippingen ville
 * latt ingenting stå igjen — et rent bindeord-søk skal ikke tømmes. */
export function stripFillerWords(q: string): string {
  const trimmed = q.trim();
  if (!trimmed) return q;
  const stripped = trimmed
    .split(/\s+/)
    .filter((word) => !STOPWORDS.has(word.toLowerCase()))
    .join(" ");
  return stripped || q;
}
