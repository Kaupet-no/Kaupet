// Dynamic Type / OS-tekststørrelse (fase 8, se docs/NATIVE-UI-UX-PLAN.md).
//
// Appen bruker `rem` gjennomgående, så det holder å skalere rot-størrelsen —
// hele typografien følger med. Det som mangler er å *lese* brukerens valgte
// tekststørrelse.
//
// Plattformene løser dette ulikt:
//
// - **iOS (WKWebView):** respekterer ikke Dynamic Type for en webapp, men
//   eksponerer den gjennom den systemdefinerte fonten `-apple-system-body`,
//   som er 17px ved standardinnstilling og vokser/krymper med brukerens valg.
//   Vi måler den på et skjult element og bruker forholdstallet.
//   `-webkit-text-size-adjust` ble vurdert først (jf. planens rekkefølge), men
//   styrer WebKits egen autosizing av smale tekstkolonner — ikke Dynamic Type.
// - **Android (WebView):** skalerer allerede all tekst etter systemets
//   fontskala (`textZoom` avledes fra `Configuration.fontScale`). Gjør vi noe
//   her, ganges skalaen med seg selv. Derfor: no-op.

import { isNative, nativePlatform } from "./native";

/** `-apple-system-body` ved standard Dynamic Type. */
const BASE_BODY_PX = 17;
/** Tailwind/appens rot-størrelse ved skala 1. */
const BASE_ROOT_PX = 16;

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
  if (scale == null || Math.abs(scale - 1) < 0.01) {
    root.style.removeProperty("font-size");
    return;
  }
  root.style.fontSize = `${BASE_ROOT_PX * scale}px`;
}

/**
 * Kobler opp rot-skaleringen. Kun iOS-native — se filkommentaren for hvorfor
 * Android og web er no-op.
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
