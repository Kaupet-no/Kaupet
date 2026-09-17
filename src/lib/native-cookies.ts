// Tvinger WebViewen til å skrive informasjonskapslene til disk. No-op på web
// og iOS.

import { registerPlugin } from "@capacitor/core";

import { isNative, nativePlatform } from "./native";

interface AuthCookiesPlugin {
  flush(): Promise<void>;
}

// Bridges to android/app/.../AuthCookiesPlugin.java
const AuthCookies = registerPlugin<AuthCookiesPlugin>("AuthCookies");

/**
 * Kalles ved hver endring i auth-tilstanden, altså i det sesjonskapselen er
 * skrevet eller slettet.
 *
 * Android-WebView holder kapsler i minnet. MainActivity.onPause() flusher,
 * men den kjører ikke hvis prosessen dør mens appen er i forgrunnen. Da gikk
 * en fersk innlogging tapt — og verre: en utlogging festet seg ikke, fordi
 * den gamle kapselen fortsatt lå på disk. Begge er verifisert i emulator.
 *
 * iOS er utelatt med vilje: WKWebView persisterer kapsler selv gjennom
 * WKHTTPCookieStore, og har ingen tilsvarende flush.
 */
export async function flushAuthCookies(): Promise<void> {
  if (!isNative()) return;
  if (nativePlatform() !== "android") return;
  try {
    await AuthCookies.flush();
  } catch {
    // Broen finnes ikke (f.eks. en eldre installasjon uten pluginen).
    // onPause-flushen i MainActivity er fortsatt på plass.
  }
}
