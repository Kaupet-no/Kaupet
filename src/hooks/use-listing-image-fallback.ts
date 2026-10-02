import { useState } from "react";

/**
 * Håndterer fallback fra thumbnail-bildet til originalbildet når thumbnail
 * ikke finnes (404 på en ren offentlig URL), og gir opp når også originalen
 * feiler — da er `effectiveImageUrl` null og `imageFailed` sann, så kortet
 * kan vise «Ingen bilde» i stedet for et ødelagt bilde med alt-tekst.
 * Nullstilles når primaryImageUrl eller fallbackImageUrl endres, så vi alltid
 * forsøker thumbnail først og fallbacken ikke kjører i evig løkke.
 */
export function useListingImageFallback(
  primaryImageUrl: string | null,
  fallbackImageUrl: string | null,
) {
  const resetKey = `${primaryImageUrl}|${fallbackImageUrl}`;
  // 0 = primær, 1 = fallback, 2 = begge feilet
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setStage(0);
  }

  const hasDistinctFallback = !!fallbackImageUrl && fallbackImageUrl !== primaryImageUrl;
  return {
    effectiveImageUrl: stage === 0 ? primaryImageUrl : stage === 1 ? fallbackImageUrl : null,
    imageFailed: stage === 2,
    handleImageError: () => setStage((s) => (s === 0 && hasDistinctFallback ? 1 : 2)),
  };
}
