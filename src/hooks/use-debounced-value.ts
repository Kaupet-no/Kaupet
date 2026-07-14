import { useEffect, useState } from "react";

/**
 * Debounces by content (via JSON serialization) rather than by reference, so
 * passing a freshly-constructed object each render only restarts the timer
 * when its actual contents changed — not on every unrelated re-render.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, delayMs]);
  return debounced;
}
