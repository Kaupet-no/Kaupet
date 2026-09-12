// Thin wrapper around @capacitor/haptics with web no-op fallback.
// Safe to call from any component — does nothing on the web.

import { registerPlugin } from "@capacitor/core";

import { isNative, nativePlatform } from "./native";

interface SoftHapticsPlugin {
  tap(): Promise<void>;
}

// Bridges to android/app/.../SoftHapticsPlugin.java — a soft KEYBOARD_TAP
// feedback that @capacitor/haptics has no way to reach on Android (its
// ImpactStyle.Light is a 50ms vibration, not a short system tick).
const SoftHaptics = registerPlugin<SoftHapticsPlugin>("SoftHaptics");

type Impact = "light" | "medium" | "heavy";
type Notification = "success" | "warning" | "error";

async function load() {
  const mod = await import("@capacitor/haptics");
  return mod;
}

export async function hapticImpact(style: Impact = "light"): Promise<void> {
  void style;
  await lightTouch();
}

export async function hapticSelection(): Promise<void> {
  await lightTouch();
}

export async function hapticNotification(type: Notification = "success"): Promise<void> {
  void type;
  await lightTouch();
}

/** One short platform-native touch; avoid Android's longer notification patterns. */
async function lightTouch(): Promise<void> {
  if (!isNative()) return;
  if (nativePlatform() === "android") {
    try {
      await SoftHaptics.tap();
      return;
    } catch {
      // Bridge unavailable (e.g. an old install without the plugin) —
      // fall through to the @capacitor/haptics fallback below.
    }
  }
  try {
    const { Haptics, ImpactStyle } = await load();
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}
