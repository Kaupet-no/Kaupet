import { useState } from "react";

/**
 * Håndterer fallback fra thumbnail-bildet til originalbildet når thumbnail
 * ikke finnes (404 på en ren offentlig URL). Nullstiller flagget når
 * primaryImageUrl eller fallbackImageUrl endres, så fallbacken ikke kjører
 * i evig løkke og vi alltid forsøker thumbnail først.
 */
export function useListingImageFallback(
  primaryImageUrl: string | null,
  fallbackImageUrl: string | null,
) {
  const resetKey = `${primaryImageUrl}|${fallbackImageUrl}`;
  const [thumbFailed, setThumbFailed] = useState(false);
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setThumbFailed(false);
  }

  return {
    effectiveImageUrl: thumbFailed && fallbackImageUrl ? fallbackImageUrl : primaryImageUrl,
    handleImageError: () => setThumbFailed(true),
  };
}
