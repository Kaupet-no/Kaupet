import type { CapacitorConfig } from "@capacitor/cli";

// Satt av CI (CAPACITOR_ENV=staging|production) før `cap sync` — se
// android-jobben i .github/workflows/ci.yml. Lokal `cap sync` uten
// variabelen faller tilbake til produksjon.
const isStaging = process.env.CAPACITOR_ENV === "staging";
const appId = isStaging ? "no.kaupet.app.staging" : "no.kaupet.app";

const config: CapacitorConfig = {
  appId,
  appName: "Kaupet",
  webDir: "capacitor-shell",
  // Matches the app's --background (src/styles.css). Without this, the
  // WebView falls back to plain white, which flashes at the edges during
  // the iOS/Android overscroll bounce when scrolling past the top/bottom.
  backgroundColor: "#fbf9f3",
  server: {
    // Produksjon peker rett på kaupet.no. Staging setter IKKE url her —
    // staging.kaupet.no ligger bak Cloudflare Access, så appen ville aldri
    // kommet forbi access-veggen ved kaldstart. I stedet lastes den lokale
    // capacitor-shell/index.html først, som lar brukeren velge
    // staging.kaupet.no eller en lokal IP før WebViewen navigerer dit.
    url: isStaging ? undefined : "https://kaupet.no",
    errorPath: "offline.html",
    // Staging may connect to a local private-network dev server, but never
    // grants the production app a wildcard navigation target.
    cleartext: isStaging,
    allowNavigation: isStaging
      ? [
          "staging.kaupet.no",
          "*.cloudflareaccess.com",
          "localhost",
          "10.*",
          "172.16.*",
          "172.17.*",
          "172.18.*",
          "172.19.*",
          "172.20.*",
          "172.21.*",
          "172.22.*",
          "172.23.*",
          "172.24.*",
          "172.25.*",
          "172.26.*",
          "172.27.*",
          "172.28.*",
          "172.29.*",
          "172.30.*",
          "172.31.*",
          "192.168.*",
        ]
      : undefined,
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
