import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/native";

// Runtimen bytter aldri plattform mens appen kjører, så det finnes ingenting
// å abonnere på.
const subscribe = () => () => {};
const serverSnapshot = () => false;

/**
 * Client-side native detection. Returns false on SSR (serveren vet ikke om
 * klienten er en WebView) og leser den ekte verdien allerede i første
 * klient-render — ikke i en effekt etterpå. Forskjellen er synlig: en
 * komponent som mountes etter at boot-splashen er borte (kodesplittet
 * ruteinnhold, en overlay) rakk med en effekt å male web-layout i én frame
 * først. useSyncExternalStore sjekker snapshotet i en layout-effekt, altså
 * før paint, så hydreringen retter seg uten at web-layouten vises.
 */
export function useIsNative(): boolean {
  return useSyncExternalStore(subscribe, isNative, serverSnapshot);
}
