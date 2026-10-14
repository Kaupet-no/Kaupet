import { useCallback, useSyncExternalStore } from "react";

const KEY = "kaupet.listing.gallery-width";
/** Lokal hendelse så alle monterte instanser oppdateres når valget endres i denne fanen. */
const CHANGE_EVENT = "kaupet:gallery-width-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Valg som ikke kunne lagres (privat modus / blokkerte cookies) gjelder
// likevel i denne økten.
let unsavedWide: boolean | undefined;

function readWide() {
  if (unsavedWide !== undefined) return unsavedWide;
  try {
    return window.localStorage.getItem(KEY) !== "narrow";
  } catch {
    return true;
  }
}

/**
 * Om bildegalleriet på annonsedetaljen skal gå i full bredde (standard) eller
 * begrenses til innholdskolonnen. Valget er en visningspreferanse som følger
 * brukeren mellom annonser, så det lagres lokalt. `useSyncExternalStore` gir
 * serverrendering standardverdien uten at klienten må rette den opp i en
 * effekt etterpå.
 */
export function useWideGallery(): [boolean, (wide: boolean) => void] {
  const wide = useSyncExternalStore(subscribe, readWide, () => true);

  const setWide = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? "wide" : "narrow");
      unsavedWide = undefined;
    } catch {
      // Preferansen huskes ikke, men visningen skal fortsatt bytte.
      unsavedWide = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [wide, setWide];
}
