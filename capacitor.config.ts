import type { CapacitorConfig } from "@capacitor/cli";

// Satt av CI (CAPACITOR_ENV=staging|production) før `cap sync` — se
// android-jobben i .github/workflows/ci.yml. Lokal `cap sync` uten
// variabelen faller tilbake til produksjon.
const isStaging = process.env.CAPACITOR_ENV === "staging";

const config: CapacitorConfig = {
  appId: "no.kaupet.app",
  appName: "Kaupet",
  webDir: "capacitor-shell",
  // Matches the app's --background (src/styles.css). Without this, the
  // WebView falls back to plain white, which flashes at the edges during
  // the iOS/Android overscroll bounce when scrolling past the top/bottom.
  backgroundColor: "#fbf9f3",
  server: {
    url: isStaging ? "https://staging.kaupet.no" : "https://kaupet.no",
    errorPath: "offline.html",
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    // "never" (Capacitor's default): the app already handles safe-area
    // insets itself via CSS env(safe-area-inset-*) (see pt-safe/pb-safe
    // and AppBottomNav's padding). Leaving this at "always" makes
    // UIScrollView dynamically recalculate its own content insets too,
    // which fights with our fixed bottom nav and makes it visibly jump
    // upward right when a scroll reaches the bottom.
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // Splashen skjules når appen faktisk har malt (hideNativeBootSplash i
      // src/lib/native.ts), ikke etter en fast ventetid — før dette ventet
      // appen alltid minst 2s, også med varm WebView (funn 3.8).
      // launchShowDuration er uten effekt når launchAutoHide er false;
      // fallbacken hvis kaupet.no ikke svarer er offline.html, som kaller
      // hide() selv.
      launchAutoHide: false,
      launchFadeOutDuration: 200,
      backgroundColor: "#fbf9f3",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      // "body" only resizes the <body> element for scrolling purposes —
      // the viewport itself (and vh/dvh units) never actually change, so
      // `position: fixed` sheets anchored to the bottom stay pinned behind
      // where the keyboard now covers. "native" resizes the WebView frame
      // itself, so fixed/dvh-based UI reflows above the keyboard correctly.
      resize: "native",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#fbf9f3",
      overlaysWebView: false,
    },
  },
};

export default config;
