import { useEffect, useState } from "react";
import { nativePlatform } from "@/lib/native";

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // `?forcenative` exercises native layout in a regular browser, but the
    // Capacitor Keyboard plugin only exists in a real iOS/Android runtime.
    if (nativePlatform() === "web") return;

    // Samme mønster som useForegroundRefresh: importen kan løses etter
    // unmount, og da skal ingen lytter registreres eller bli liggende.
    let disposed = false;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];

    void import("@capacitor/keyboard")
      .then(({ Keyboard }) => {
        if (disposed) return;
        handles.push(
          Keyboard.addListener("keyboardWillShow", () => setVisible(true)),
          Keyboard.addListener("keyboardWillHide", () => setVisible(false)),
        );
      })
      .catch(() => {});

    return () => {
      disposed = true;
      for (const handle of handles) void handle.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  return visible;
}
