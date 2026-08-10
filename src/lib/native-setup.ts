// One-shot native initialization: status bar styling + keyboard behavior.
// Safe to call from any component effect; no-ops on web.

import { isNative, nativePlatform } from "./native";
import { lockPortraitOnPhone } from "./orientation";
import { initTextScale } from "./text-scale";

let initialized = false;

// Status bar style/color — driven by the app's resolved theme (see
// useTheme), not raw OS preference, so it stays in sync when the user
// overrides the theme manually instead of following system settings.
export async function syncStatusBarTheme(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = dark CONTENT (light text) — used on dark backgrounds.
    // Style.Light = light CONTENT (dark text) — used on light backgrounds.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    try {
      await StatusBar.setBackgroundColor({
        color: dark ? "#1d2a22" : "#fbf9f3",
      });
    } catch {
      /* iOS doesn't support setBackgroundColor */
    }
  } catch {
    /* plugin unavailable */
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
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
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
