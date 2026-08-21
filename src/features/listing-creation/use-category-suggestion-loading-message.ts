import { useEffect, useState } from "react";

/** Matches the AI category-suggestion fallback's worst-case budget
 * . Shared by the sell flow's CategoryConfirm and the WTB
 * (ønskes kjøpt) flow's equivalent step in ny-ok-annonse.tsx. */
export const CATEGORY_SUGGESTION_LOADING_MESSAGES = [
  "Forsøker å identifisere annonsekategori",
  "Identifiserer innhold",
  "Henter kategoriforslag...",
  "Snart ferdig...",
  "Dette tar litt lenger tid enn forventet. Beklager ventetiden.",
];

export function useCategorySuggestionLoadingMessage(active: boolean): string {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t1 = window.setTimeout(() => setStage(1), 8_000);
    const t2 = window.setTimeout(() => setStage(2), 20_000);
    const t3 = window.setTimeout(() => setStage(3), 45_000);
    const t4 = window.setTimeout(() => setStage(4), 80_000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [active]);
  return active
    ? CATEGORY_SUGGESTION_LOADING_MESSAGES[stage]
    : CATEGORY_SUGGESTION_LOADING_MESSAGES[0];
}
