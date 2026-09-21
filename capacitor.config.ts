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
    //
    // Every IPv4 mask below has all four dot-separated octets ("10.*.*.*",
    // not "10.*"). Capacitor's host matcher (HostMask.Simple.matches in
    // @capacitor/android/.../util/HostMask.java) rejects a match outright
    // when the mask has more than one part and its part count doesn't equal
    // the host's part count — "10.*" (2 parts) can never match "10.0.2.2"
    // (4 parts), no matter the octet values. Confirmed via logcat on the
    // emulator's host alias (10.0.2.2): Android fell through to opening
    // Chrome instead of navigating the WebView.
    cleartext: isStaging,
    allowNavigation: isStaging
      ? [
          "staging.kaupet.no",
          "*.cloudflareaccess.com",
          "localhost",
          "10.*.*.*",
          "172.16.*.*",
          "172.17.*.*",
          "172.18.*.*",
          "172.19.*.*",
          "172.20.*.*",
          "172.21.*.*",
          "172.22.*.*",
          "172.23.*.*",
          "172.24.*.*",
          "172.25.*.*",
          "172.26.*.*",
          "172.27.*.*",
          "172.28.*.*",
          "172.29.*.*",
          "172.30.*.*",
          "172.31.*.*",
          "192.168.*.*",
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
      // launchShowDuration er en siste skanse på 15 s for sider som aldri
      // kan kalle hide() over broen (Capacitors plugin-dispatch er scoped til
      // den ene originen broen ble opprettet med), slik at en frossen splash
      // aldri blir stående med tvangsavslutning som eneste vei ut. 15 s er
      // bevisst romslig: en normal kaldstart har malt og skjult splashen for
      // lengst, så ventilen utløser aldri i praksis.
      launchAutoHide: true,
      launchShowDuration: 15000,
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
    // The edge-to-edge-aware replacement for StatusBar on Android 15+
    // (targetSdk 35+, see android/variables.gradle) — see the comment on
    // syncStatusBarTheme in src/lib/native-setup.ts for why both are needed.
    // Matches StatusBar's default so cold start doesn't flash the wrong
    // icon color before ThemeProvider's effect runs.
    SystemBars: {
      style: "LIGHT",
    },
  },
};

export default config;
