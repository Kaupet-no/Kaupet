import { useEffect, useState } from "react";
import { nativePlatform } from "@/lib/native";

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // `?forcenative` exercises native layout in a regular browser, but the
    // Capacitor Keyboard plugin only exists in a real iOS/Android runtime.
    if (nativePlatform() === "web") return;

    let cleanup: (() => void) | undefined;

    import("@capacitor/keyboard").then(({ Keyboard }) => {
      const showListener = Keyboard.addListener("keyboardWillShow", () => setVisible(true));
      const hideListener = Keyboard.addListener("keyboardWillHide", () => setVisible(false));

      cleanup = () => {
        showListener.then((h) => h.remove());
        hideListener.then((h) => h.remove());
      };
    });

    return () => cleanup?.();
  }, []);

  return visible;
}
