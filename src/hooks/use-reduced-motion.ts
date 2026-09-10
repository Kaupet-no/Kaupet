import { useMediaQuery } from "@/hooks/use-media-query";

/** `prefers-reduced-motion: reduce`. Se `useMediaQuery`. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
