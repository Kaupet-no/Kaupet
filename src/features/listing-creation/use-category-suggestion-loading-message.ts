import { useEffect, useState } from "react";

/** Matches the AI category-suggestion fallback's cold-start budget (~20s
 * observed, 25s timeout — see category-suggestion-ai.server.ts) with staged
 * copy, so a slow but still-in-flight request doesn't read as frozen or
 * broken. Shared by the sell flow's CategoryConfirm and the WTB
 * (ønskes kjøpt) flow's equivalent step in ny-ok-annonse.tsx. */
export const CATEGORY_SUGGESTION_LOADING_MESSAGES = [
  "Setter opp annonse...",
  "Henter kategoriforslag...",
  "Dette tar litt lenger tid enn forventet. Beklager ventetiden.",
];

export function useCategorySuggestionLoadingMessage(active: boolean): string {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t1 = window.setTimeout(() => setStage(1), 8_000);
    const t2 = window.setTimeout(() => setStage(2), 15_000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);
  return active
    ? CATEGORY_SUGGESTION_LOADING_MESSAGES[stage]
    : CATEGORY_SUGGESTION_LOADING_MESSAGES[0];
}
