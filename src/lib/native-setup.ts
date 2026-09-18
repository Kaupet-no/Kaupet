// One-shot native initialization: status bar styling + keyboard behavior.
// Safe to call from any component effect; no-ops on web.

import { registerPlugin } from "@capacitor/core";
import { isNative, nativePlatform } from "./native";
import { lockPortraitOnPhone } from "./orientation";
import { initTextScale } from "./text-scale";

interface ShellThemePlugin {
  set(options: { dark: boolean }): Promise<void>;
}

// Bridges to android/app/.../ShellThemePlugin.java. Mirrors the resolved
// theme into SharedPreferences so MainActivity can inject it into
// capacitor-shell/offline.html and index.html — those pages are served from
// this app's own local origin, never server.url, so window.Capacitor (and
// this very plugin) is never available there. See ShellThemePlugin's own
// comment for why a plugin call from here (the real app origin, where the
// bridge does work) is the only way the choice reaches native at all.
const ShellTheme = registerPlugin<ShellThemePlugin>("ShellTheme");

let initialized = false;

// Dev-only visibility for native calls that fail silently otherwise — see
// the catch blocks below for why a failure here is expected on staging.
function warnNativeCallFailed(what: string, err: unknown): void {
  if (import.meta.env.DEV) console.warn(`[native-setup] ${what} failed:`, err);
}

// Status bar style/color — driven by the app's resolved theme (see
// useTheme), not raw OS preference, so it stays in sync when the user
// overrides the theme manually instead of following system settings.
//
// Two calls, because neither alone reaches every runtime this app ships to:
// - `@capacitor/core`'s built-in `SystemBars` is edge-to-edge-aware but
//   re-applies its own remembered style — defaulting to the OS's night
//   mode, not this app's resolved theme — on every config change (rotation,
//   keyboard show/hide, both declared in AndroidManifest configChanges), so
//   it needs its own explicit call to stay correct after one.
// - `@capacitor/status-bar` (legacy) is still what owns `setBackgroundColor`.
//
// Both now work identically on staging and production Android, and on iOS:
// the Bridge is created with server.url already pointing at the chosen
// target (see MainActivity.onCreate and ServerTargetPlugin.java), so
// Capacitor's plugin-dispatch JS injection applies to it like any other
// origin, instead of the WebView being redirected there afterward.
//
// Each call is independently best-effort and logged in dev so a failure
// isn't invisible, rather than swallowed outright.
export async function syncStatusBarTheme(dark: boolean): Promise<void> {
  if (!isNative()) return;

  try {
    const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
    await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  } catch (err) {
    warnNativeCallFailed("SystemBars.setStyle", err);
  }

  try {
    // Android only (see ShellTheme.set's own comment) — no-ops via the
    // catch on iOS, where offline.html doesn't need it (WKWebView's
    // env(safe-area-inset-*) and the shell's own prefers-color-scheme
    // fallback are already correct there).
    await ShellTheme.set({ dark });
  } catch (err) {
    warnNativeCallFailed("ShellTheme.set", err);
  }

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = dark CONTENT (light text) — used on dark backgrounds.
    // Style.Light = light CONTENT (dark text) — used on light backgrounds.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    try {
      await StatusBar.setBackgroundColor({
        color: dark ? "#1d2a22" : "#fbf9f3",
      });
    } catch (err) {
      // iOS doesn't support setBackgroundColor, and Android 15+ ignores it
      // under enforced edge-to-edge (see @capacitor/status-bar's
      // shouldSetStatusBarColor) — both expected, still logged for dev
      // visibility rather than swallowed outright.
      warnNativeCallFailed("StatusBar.setBackgroundColor", err);
    }
  } catch (err) {
    warnNativeCallFailed("StatusBar.setStyle", err);
  }
}

export async function setupNative(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;

  // Gate for native-only CSS (tap-highlight, user-select, overscroll —
  // se .native i styles.css).
  document.documentElement.classList.add("native");

  // Portrett-lås på telefon; nettbrett roterer fritt. Unntaket (fullskjerm-
  // bilde) slipper låsen opp midlertidig, se src/lib/orientation.ts.
  void lockPortraitOnPhone();

  // OS-tekststørrelse (Dynamic Type) → rot-font-size, se src/lib/text-scale.ts.
  initTextScale();

  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  } catch {
    /* plugin unavailable */
  }

  // Visual viewport tracking — covers both layout and scroll-into-view needs.
  //
  // window.visualViewport.height always equals the area above the on-screen
  // keyboard on iOS (WKWebView) and Android (WebView), making it more
  // reliable than dvh/innerHeight in Capacitor contexts.
  //
  // Two things happen on every resize:
  //   1. --vvh is updated so CSS layouts (e.g. flex-1 textareas) shrink
  //      automatically when the keyboard appears.
  //   2. When the viewport shrinks (keyboard opened), the currently focused
  //      input or textarea is scrolled into view so the keyboard does not
  //      cover it.
  if (window.visualViewport) {
    let prevHeight = window.visualViewport.height;

    const onViewportResize = () => {
      const h = window.visualViewport!.height;
      document.documentElement.style.setProperty("--vvh", `${h}px`);

      if (h < prevHeight) {
        // Keyboard appeared — scroll focused field into view after the
        // browser has had one frame to reflow the shrunken layout.
        requestAnimationFrame(() => {
          const el = document.activeElement as HTMLElement | null;
          if (
            (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
            !el.closest("[data-composer-scroll]")
          ) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }

      prevHeight = h;
    };

    onViewportResize();
    window.visualViewport.addEventListener("resize", onViewportResize);
  }

  // Keyboard — resize the native WebView (not just <body>) so position:fixed
  // elements reflow above the keyboard rather than staying pinned behind it.
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    if (nativePlatform() === "ios") {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      await Keyboard.setScroll({ isDisabled: false }).catch(() => {});
    }
  } catch {
    /* plugin unavailable */
  }
}
