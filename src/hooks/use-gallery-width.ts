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

function readWide() {
  try {
    return window.localStorage.getItem(KEY) !== "narrow";
  } catch {
    // Privat modus / blokkerte cookies: behold standarden.
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
    } catch {
      // Preferansen huskes ikke, men visningen skal fortsatt bytte.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [wide, setWide];
}
