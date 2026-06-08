import { useEffect, useState } from "react";
import { isNative } from "@/lib/native";

/**
 * Client-side native detection. Returns false on SSR + first render to avoid
 * hydration mismatches; flips to true once mounted in a Capacitor WebView.
 */
export function useIsNative(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNative());
  }, []);
  return native;
}
