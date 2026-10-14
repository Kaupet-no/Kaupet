// Dynamic Type / OS-tekststørrelse.
//
// Skalerer KUN typografitokens (`--text-*` i src/styles.css), aldri rot-
// font-size. `rem` er alltid relativt til <html>-elementets font-size —
// uavhengig av hva noen etterkommer setter — så å skalere rota skalerer
// samtidig all avstand, ikonstørrelse og treffområder som også er uttrykt i
// rem (padding, gap, size-*, radius). Det ga i praksis en app som vokste
// ukontrollert i alt, ikke bare i tekst — bunnavigasjon og FAB ble like
// mye større som brødteksten, og på de største tilgjengelighetsstørrelsene
// klippet primærhandlinger i onboarding utenfor skjermen.
//
// I stedet settes en CSS-variabel (`--kaupet-text-scale`) på <html>, som
// Tailwinds egne `--text-*`-temavariabler i styles.css multipliseres med.
// Det gjør at hver `text-*`-Tailwind-klasse i hele appen skalerer riktig,
// mens `p-*`, `gap-*`, `size-*`, `rounded-*` og `h-*`/`w-*` forblir uendret.
//
// Plattformene løser målingen ulikt:
//
// - **iOS (WKWebView):** respekterer ikke Dynamic Type for en webapp, men
//   eksponerer den gjennom den systemdefinerte fonten `-apple-system-body`,
//   som er 17px ved standardinnstilling og vokser/krymper med brukerens valg.
//   Vi måler den på et skjult element og bruker forholdstallet.
//   `-webkit-text-size-adjust` ble vurdert først (jf. planens rekkefølge), men
//   styrer WebKits egen autosizing av smale tekstkolonner — ikke Dynamic Type.
// - **Android (WebView):** MainActivity.java låser WebView-ens `textZoom` til
//   100 slik at layout aldri vokser ukontrollert fra OS-innstillingen, og
//   TextScalePlugin eksponerer `Configuration.fontScale`. En endring av
//   fontskalaen gjenskaper aktiviteten (fontScale står ikke i configChanges),
//   så siden laster på nytt og leser verdien igjen.

import { registerPlugin } from "@capacitor/core";

import { isNative, nativePlatform } from "./native";

const TextScale = registerPlugin<{ get(): Promise<{ fontScale: number }> }>("TextScale");

/** Androids fontskala via TextScalePlugin; null når broen mangler (eldre app). */
export async function readAndroidFontScale(): Promise<number | null> {
  try {
    const { fontScale } = await TextScale.get();
    return Number.isFinite(fontScale) && fontScale > 0 ? clampScale(fontScale) : null;
  } catch {
    return null;
  }
}

/** `-apple-system-body` ved standard Dynamic Type. */
const BASE_BODY_PX = 17;

/** CSS-variabelen Tailwinds `--text-*`-tokens multipliseres med, se styles.css. */
const SCALE_PROPERTY = "--kaupet-text-scale";

// ponytail: taket er 200 % (WCAG 1.4.4). iOS' største tilgjengelighets-
// størrelser går til ~3,1x, men appen er ikke verifisert over 200 % — hev
// taket når layouten faktisk er sett på de størrelsene.
const MIN_SCALE = 0.8;
const MAX_SCALE = 2;

/**
 * Brukerens tekstskala, målt mot `-apple-system-body`. Returnerer `null` når
 * plattformen ikke kjenner fonten (alle ikke-Apple-nettlesere), slik at vi
 * ikke tolker «ignorert deklarasjon» som «brukeren vil ha 6 % mindre tekst».
 */
export function measureTextScale(doc: Document = document): number | null {
  if (typeof CSS === "undefined" || !CSS.supports?.("font", "-apple-system-body")) return null;
  const probe = doc.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;font:-apple-system-body";
  doc.body.appendChild(probe);
  const px = Number.parseFloat(doc.defaultView!.getComputedStyle(probe).fontSize);
  probe.remove();
  if (!Number.isFinite(px) || px <= 0) return null;
  return clampScale(px / BASE_BODY_PX);
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function apply(scale: number | null = measureTextScale()): void {
  const root = document.documentElement;
  if (scale == null) {
    root.style.removeProperty(SCALE_PROPERTY);
    return;
  }
  root.style.setProperty(SCALE_PROPERTY, String(scale));
}

/**
 * Kobler opp typografiskaleringen på native. Web er no-op: nettleserens egen
 * tekstzoom virker der allerede.
 */
export function initTextScale(): void {
  if (!isNative()) return;
  const platform = nativePlatform();
  if (platform === "android") {
    void readAndroidFontScale().then(apply);
    return;
  }
  if (platform !== "ios") return;
  apply();
  // Dynamic Type endres i Innstillinger, altså mens appen er i bakgrunnen —
  // ingen resize fyrer av seg selv. Mål på nytt når appen kommer tilbake.
  void import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) apply();
      }),
    )
    .catch(() => {
      /* plugin unavailable */
    });
}
