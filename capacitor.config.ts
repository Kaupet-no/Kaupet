import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "no.kaupet.app",
  appName: "Kaupet",
  webDir: "capacitor-shell",
  // Matches the app's --background (src/styles.css). Without this, the
  // WebView falls back to plain white, which flashes at the edges during
  // the iOS/Android overscroll bounce when scrolling past the top/bottom.
  backgroundColor: "#fbf9f3",
  server: {
    url: "https://kaupet.no",
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
      launchShowDuration: 2000,
      launchAutoHide: true,
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
