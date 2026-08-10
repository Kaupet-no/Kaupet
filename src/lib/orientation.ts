// Orienteringsstyring (fase 5, se docs/NATIVE-UI-UX-PLAN.md).
//
// Telefon er låst til portrett, med ett unntak: fullskjermvisning av bilde.
// Nettbrett låses aldri. Låsen styres i kjøretid — `Info.plist` beholder
// bevisst landskap, ellers ville unntaket vært umulig (iOS tillater kun
// orienteringer som er deklarert der).

import { isNative } from "./native";

/**
 * Samme 768px-grense som `useFormFactor()`, men målt på **korteste** side:
 * en telefon i landskap er 844px bred og ville ellers blitt lest som
 * nettbrett — nøyaktig i tilstanden der vi skal låse den tilbake.
 */
function isPhone(): boolean {
  if (!isNative() || typeof window === "undefined") return false;
  return Math.min(window.innerWidth, window.innerHeight) < 768;
}

let locked = false;

async function screenOrientation() {
  const { ScreenOrientation } = await import("@capacitor/screen-orientation");
  return ScreenOrientation;
}

/** Lås til portrett — kun på telefon. No-op på nettbrett og web. */
export async function lockPortraitOnPhone(): Promise<void> {
  if (!isPhone()) return;
  try {
    await (await screenOrientation()).lock({ orientation: "portrait" });
    locked = true;
  } catch {
    /* plugin unavailable */
  }
}

/** Slipp låsen opp igjen (fullskjermbilde). No-op hvis vi aldri låste. */
export async function unlockOrientation(): Promise<void> {
  if (!locked) return;
  try {
    await (await screenOrientation()).unlock();
    locked = false;
  } catch {
    /* plugin unavailable */
  }
}
