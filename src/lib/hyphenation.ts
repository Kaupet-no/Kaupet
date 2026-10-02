// Orddelingsstøtte og etikettkorting for fliser med fast bredde.

let hyphenationProbe: boolean | undefined;

/**
 * Orddeles lange norske ord faktisk inne i en kategoriflis? Måles én gang
 * per sideøkt med en nøyaktig replika av flisen — appens egne
 * utility-klasser på et ekte `<button>`-element, samme skrift, linjeklemme
 * og sentrering som etikettene rendres med — `hyphens: auto` mot
 * `hyphens: none`. Bare orddeling som virker i *den* konteksten gir ulik
 * høyde; ellers er svaret `false` (eldre WebView-er uten hyfenering, eller
 * motorer der klemmen/skriften/knappen blokkerer det), og da kortes
 * flis-etikettene i stedet (se shortenTileLabel), slik at lange enkelord
 * aldri renner ut over flisen.
 */
export function norwegianHyphenationSupported(): boolean {
  if (hyphenationProbe === undefined) hyphenationProbe = measure();
  return hyphenationProbe;
}

/**
 * Kun i dev-bygg (`import.meta.env.DEV`): `?kortetiketter` tvinger korting
 * på, slik at fallbacken kan verifiseres i en nettleser som selv orddelet
 * (og derfor ellers aldri viser den kortede etiketten).
 */
export function forceShortenedTileLabels(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).has("kortetiketter");
  } catch {
    return false;
  }
}

function measure(): boolean {
  try {
    if (typeof document === "undefined" || typeof CSS === "undefined") return false;
    if (!CSS.supports("hyphens", "auto")) return false;
    const tile = (hyphens: string) => {
      const host = document.createElement("div");
      host.lang = "nb";
      host.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;top:0;left:-9999px";
      const button = document.createElement("button");
      button.type = "button";
      // Replika av CategoryRail-flisen: de samme klassene appens Tailwind-
      // css definerer, i samme struktur — ellers måler sonden en annen
      // kontekst enn etikettene faktisk rendres i.
      button.className = "flex w-16 shrink-0 flex-col items-center gap-2 text-center";
      const label = document.createElement("span");
      label.className = "line-clamp-2 w-full hyphens-auto text-xs leading-tight";
      label.style.hyphens = hyphens;
      label.textContent = "Underholdning";
      button.appendChild(label);
      host.appendChild(button);
      document.body.appendChild(host);
      const height = label.getBoundingClientRect().height;
      host.remove();
      return height;
    };
    // Uten virkende orddeling blir ordet ei klippet linje; med orddeling
    // fyller det to klemte linjer i den 64px smale flisen.
    return tile("auto") > tile("none") + 1;
  } catch {
    return false;
  }
}

/** Flisbredden i CategoryRail (w-16). */
const TILE_WIDTH_PX = 64;
/** Konservativt fallback-budsjett når bredde ikke kan måles (jsdom, SSR):
 * åtte bokstaver + «...» holder med god margin i alle aktuelle skrifter. */
const TILE_WORD_BUDGET_FALLBACK = 8;

let tileWordBudgetProbe: number | undefined;

/**
 * Hvor mange bokstaver som faktisk får plass på én linje i flisen, med
 * «...» til slutt. Måles én gang per sideøkt i appens skrift og skala —
 * tegnbredden varierer med skrifttype og Dynamic Type, og et fast tegntall
 * klipper prikkene (en forkortelse som er for bred ser ut som én prikk:
 * «...»-halen kuttet av linjeklemmen).
 */
function tileWordBudget(): number {
  if (tileWordBudgetProbe !== undefined) return tileWordBudgetProbe;
  tileWordBudgetProbe = measureTileWordBudget();
  return tileWordBudgetProbe;
}

function measureTileWordBudget(): number {
  try {
    if (typeof document === "undefined") return TILE_WORD_BUDGET_FALLBACK;
    const host = document.createElement("div");
    host.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;top:0;left:-9999px";
    const span = document.createElement("span");
    // Samme typografi som etiketten, slik at målingen gjelder den reelle
    // skriftbredden — også under rot-skalert tekststørrelse.
    span.className = "text-xs leading-tight";
    host.appendChild(span);
    document.body.appendChild(host);
    const widthOf = (text: string) => {
      span.textContent = text;
      return span.getBoundingClientRect().width;
    };
    const word = widthOf("Underholdning");
    const dots = widthOf("...");
    host.remove();
    const perChar = word / 13;
    if (perChar <= 0) return TILE_WORD_BUDGET_FALLBACK;
    return Math.max(3, Math.floor((TILE_WIDTH_PX - dots) / perChar));
  } catch {
    return TILE_WORD_BUDGET_FALLBACK;
  }
}

/**
 * Kortet flis-etikett for enheter der orddeling ikke virker: ord som er for
 * lange for én linje i flisen avkortes med «...» til slutt, og kortingens
 * lengde er målt til faktisk å få plass — prikkene klippes aldri.
 * Mellomromsbrudd fungerer som før, så etiketter satt sammen av korte ord
 * brytes fortsatt pent over to linjer — bare de enkelange, lange ordene
 * kortes. (Når orddeling derimot virker, deler motoren ordene selv og
 * setter «-» etter første del på linjen — det er native adferd i
 * `hyphens: auto`, ingenting vi legger på selv.)
 */
export function shortenTileLabel(label: string): string {
  if (!label) return label ?? "";
  const budget = tileWordBudget();
  return label
    .split(" ")
    .map((word) => (word.length > budget ? `${word.slice(0, budget)}...` : word))
    .join(" ");
}
