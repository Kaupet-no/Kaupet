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
  // Set by goNext/goBack/setStep, right before a call that can itself cause
  // `pages` to reshape in the same tick — e.g. picking a category on the
  // category-select step both advances the step *and* swaps in that
  // category's page set. Without this flag the effect below would "correct"
  // the already-advanced step by re-deriving it from where the *old*,
  // pre-selection pages array put that step index, landing one or more
  // pages further than intended (reported as skipping straight from
  // category-select to a vehicle category's third page).
  const navigatedRef = useRef(false);

  useEffect(() => {
    const previousPages = previousPagesRef.current;
    if (previousPages === pages) return;
    previousPagesRef.current = pages;
    if (navigatedRef.current) {
      navigatedRef.current = false;
      return;
    }

    const activeKey = previousPages[step - 1]?.groups[0]?.key;
    const matchingPage = activeKey
      ? pages.findIndex((page) => page.groups.some((group) => group.key === activeKey))
      : -1;
    setStepRaw(matchingPage >= 0 ? matchingPage + 1 : clamp(step));
  }, [clamp, pages, step]);

  return {
    step,
    totalSteps: pages.length,
    currentPage: pages[step - 1],
    setStep: (n: number) => {
      navigatedRef.current = true;
      setStepRaw(clamp(n));
    },
    goNext: () => {
      navigatedRef.current = true;
      setStepRaw((s) => clamp(s + 1));
    },
    goBack: () => {
      navigatedRef.current = true;
      setStepRaw((s) => clamp(s - 1));
    },
    isFirst: step === 1,
    isLast: step === pages.length,
  };
}
