import { useEffect, useState } from "react";
import { isNative } from "./native";

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isNative()) return;

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
