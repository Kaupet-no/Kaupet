// Thin wrapper around @capacitor/haptics with web no-op fallback.
// Safe to call from any component — does nothing on the web.

import { isNative } from "./native";

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
  try {
    const { Haptics, ImpactStyle } = await load();
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}
