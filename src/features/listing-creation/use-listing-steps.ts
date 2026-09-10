import { useCallback, useEffect, useRef, useState } from "react";

import type { FieldGroup } from "./field-groups/registry";

export type WizardPage = { groups: FieldGroup[] };

/**
 * Generic step-list navigation: an index-based cursor over `pages`, clamped
 * to bounds. Backs the listing-creation wizard's step state so step
 * count/order can vary per category flow (see category-flows.ts) without
 * every call site managing clamping by hand.
 */
export function useListingSteps(pages: WizardPage[]) {
  const [step, setStepRaw] = useState(1);
  const clamp = useCallback((n: number) => Math.min(Math.max(n, 1), pages.length), [pages.length]);
  const previousPagesRef = useRef(pages);

  useEffect(() => {
    const previousPages = previousPagesRef.current;
    if (previousPages === pages) return;

    const activeKey = previousPages[step - 1]?.groups[0]?.key;
    const matchingPage = activeKey
      ? pages.findIndex((page) => page.groups.some((group) => group.key === activeKey))
      : -1;
    setStepRaw(matchingPage >= 0 ? matchingPage + 1 : clamp(step));
    previousPagesRef.current = pages;
  }, [clamp, pages, step]);

  return {
    step,
    totalSteps: pages.length,
    currentPage: pages[step - 1],
    setStep: (n: number) => setStepRaw(clamp(n)),
    goNext: () => setStepRaw((s) => clamp(s + 1)),
    goBack: () => setStepRaw((s) => clamp(s - 1)),
    isFirst: step === 1,
    isLast: step === pages.length,
  };
}
