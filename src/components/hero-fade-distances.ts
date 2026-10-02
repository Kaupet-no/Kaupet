/** Fade-lengde til hver hero-del er oppmålt (fallback før første layout). */
export const HERO_FADE_FALLBACK_PX = 180;
/**
 * Kortest tillatte fade per del. På lave skjermer er det fysiske rommet til
 * innholdet for kort til en behagelig fade — da fader delen i sitt eget
 * tempo i stedet, og innholdet (ugjennomsiktig, høyere z-index) dekker den
 * uansett lenge før den er helt borte. Minimumene er trappet etter
 * plasseringen — Kaupet-kode-knappen (nederst), deretter
 * kategorivelgeren, deretter søkefeltet — slik at rekkefølgen (knappen
 * forsvinner først) også gjelder når minimumene slår inn.
 */
const SEARCH_FADE_MIN_PX = 260;
const RAIL_FADE_MIN_PX = 140;
const CODE_FADE_MIN_PX = 100;
/** En hero-del skal være helt borte så mange piksler før innholdet ligger
 * over den, slik at delene aldri synes under annet innhold når det er rom
 * til det. */
const HERO_FADE_CLEARANCE_PX = 48;

/**
 * Fade-lengde per hero-del i nativeforsidens hero: veien fra delens bunn til
 * innholdets start, minus margin — men aldri kortere enn delens minimum.
 * Delen som ligger nederst får kortest lengde og tones ut fortest —
 * Kaupet-kode-knappen, deretter kategorivelgeren, deretter søkefeltet — og
 * på høye skjermer er ingen del synlig når innholdet kommer over den.
 * (Logoen fester og scroller av, se app-landing.tsx.)
 *
 * Alle mål må være i samme koordinatsystem: app-landing sender
 * dokumentkoordinater — hero-delene er fastlåste i viewporten, så
 * viewport- og dokumentposisjon sammenfaller der, mens innholdets topp
 * måles med + scrollY for å holde målingen riktig også under scroll.
 */
export function heroFadeDistances(
  bottoms: { search: number; rail: number; code: number },
  contentTop: number,
): { search: number; rail: number; code: number } {
  const distance = (bottom: number, minPx: number) =>
    Math.max(minPx, contentTop - bottom - HERO_FADE_CLEARANCE_PX);
  return {
    search: distance(bottoms.search, SEARCH_FADE_MIN_PX),
    rail: distance(bottoms.rail, RAIL_FADE_MIN_PX),
    code: distance(bottoms.code, CODE_FADE_MIN_PX),
  };
}
