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
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await load();
    const map: Record<Impact, (typeof ImpactStyle)[keyof typeof ImpactStyle]> = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: map[style] });
  } catch {
    /* ignore */
  }
}

export async function hapticSelection(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics } = await load();
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  } catch {
    /* ignore */
  }
}

export async function hapticNotification(
  type: Notification = "success",
): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await load();
    const map: Record<Notification, (typeof NotificationType)[keyof typeof NotificationType]> = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: map[type] });
  } catch {
    /* ignore */
  }
}
