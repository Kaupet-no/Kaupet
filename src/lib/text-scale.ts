// Dynamic Type / OS-tekststørrelse (fase 8, se docs/NATIVE-UI-UX-PLAN.md).
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
// - **Android (WebView):** systemets fontskala (`Configuration.fontScale`)
//   styres i stedet på native side — se MainActivity.java, som låser
//   WebView-ens `textZoom` til 100 slik at layout aldri vokser ukontrollert
//   fra OS-innstillingen. Denne modulen forblir derfor no-op på Android; en
//   fremtidig egen skalering der krever en native bro til
//   `Configuration.fontScale` (ingen slik bro finnes i dag).

import { isNative, nativePlatform } from "./native";

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

function apply(): void {
  const scale = measureTextScale();
  const root = document.documentElement;
  if (scale == null) {
    root.style.removeProperty(SCALE_PROPERTY);
    return;
  }
  root.style.setProperty(SCALE_PROPERTY, String(scale));
}

/**
 * Kobler opp typografiskaleringen. Kun iOS-native — se filkommentaren for
 * hvorfor Android og web er no-op.
 */
export function initTextScale(): void {
  if (!isNative() || nativePlatform() !== "ios") return;
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
