/** Fade-lengde til hver hero-del er oppmålt (fallback før første layout). */
export const HERO_FADE_FALLBACK_PX = 180;
/**
 * Kortest tillatte fade per del. På lave skjermer er det fysiske rommet til
 * innholdet for kort til en behagelig fade — da fader delen i sitt eget
 * tempo i stedet, og innholdet (ugjennomsiktig, høyere z-index) dekker den
 * uansett lenge før den er helt borte. Kategorivelgerens minimum er kortere
 * enn søkefeltets, slik at rekkefølgen (velgeren forsvinner først) også
 * gjelder når begge minimum slår inn.
 */
const SEARCH_FADE_MIN_PX = 260;
const RAIL_FADE_MIN_PX = 140;
/** En hero-del skal være helt borte så mange piksler før innholdet ligger
 * over den, slik at søk og kategorivelger aldri synes under annet innhold
 * når det er rom til det. */
const HERO_FADE_CLEARANCE_PX = 48;

/**
 * Fade-lengde per hero-del i nativeforsidens hero: veien fra delens bunn til
 * innholdets start, minus margin — men aldri kortere enn delens minimum.
 * Kategorivelgeren ligger nederst og får dermed kortest lengde — den tones
 * ut fortest, deretter søkefeltet — og på høye skjermer er ingen del synlig
 * når innholdet kommer over den. (Logoen tones ikke ut; den fester og
 * scroller av, se app-landing.tsx.)
 */
export function heroFadeDistances(
  bottoms: { search: number; rail: number },
  contentTop: number,
): { search: number; rail: number } {
  const distance = (bottom: number, minPx: number) =>
    Math.max(minPx, contentTop - bottom - HERO_FADE_CLEARANCE_PX);
  return {
    search: distance(bottoms.search, SEARCH_FADE_MIN_PX),
    rail: distance(bottoms.rail, RAIL_FADE_MIN_PX),
  };
}
