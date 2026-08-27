import { useEffect, useState } from "react";

/** Shared by the sell flow's CategoryConfirm and the WTB (ønskes kjøpt)
 * flow's equivalent step in ny-ok-annonse.tsx. */
export const CATEGORY_SUGGESTION_LOADING_MESSAGES = [
  "Forsøker å identifisere annonsekategori",
  "Identifiserer innhold",
];

export function useCategorySuggestionLoadingMessage(active: boolean): string {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t1 = window.setTimeout(() => setStage(1), 600);
    return () => window.clearTimeout(t1);
  }, [active]);
  return active
    ? CATEGORY_SUGGESTION_LOADING_MESSAGES[stage]
    : CATEGORY_SUGGESTION_LOADING_MESSAGES[0];
}
