// One-shot native initialization: status bar styling + keyboard behavior.
// Safe to call from any component effect; no-ops on web.

import { isNative, nativePlatform } from "./native";

let initialized = false;

export async function setupNative(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;

  // Status bar — match the cream background with dark icons.
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const apply = async () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
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
    };
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => void apply());
  } catch {
    /* plugin unavailable */
  }

  // Keyboard — resize body so inputs aren't covered, and scroll focused
  // field into view when keyboard appears.
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    if (nativePlatform() === "ios") {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      await Keyboard.setScroll({ isDisabled: false }).catch(() => {});
    }
    Keyboard.addListener("keyboardWillShow", () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && typeof el.scrollIntoView === "function") {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    });
  } catch {
    /* plugin unavailable */
  }
}
