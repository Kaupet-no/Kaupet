import { toast, type ExternalToast } from "sonner";

import { hapticImpact, hapticNotification } from "./haptics";
import { isNative } from "./native";

function hapticForType(type: "success" | "error" | "warning" | "info") {
  if (!isNative()) return;
  if (type === "success" || type === "info") void hapticImpact("light");
  else void hapticNotification(type === "warning" ? "warning" : "error");
}

export function showToast(
  type: "success" | "error" | "warning" | "info",
  message: string,
  opts?: ExternalToast,
) {
  hapticForType(type);
  return toast[type](message, opts);
}

export function showSuccessToast(message: string, opts?: ExternalToast) {
  return showToast("success", message, opts);
}

export function showErrorToast(message: string, opts?: ExternalToast) {
  return showToast("error", message, opts);
}
