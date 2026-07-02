import { useState } from "react";

/**
 * Generic step-list navigation: an index-based cursor over `totalSteps`
 * screens, clamped to bounds. Backs the listing-creation wizard's step state
 * so step count/order can eventually vary per category flow (see
 * category-flows.ts) without every call site managing clamping by hand.
 */
export function useListingSteps(totalSteps: number) {
  const [step, setStepRaw] = useState(1);
  const clamp = (n: number) => Math.min(Math.max(n, 1), totalSteps);

  return {
    step,
    totalSteps,
    setStep: (n: number) => setStepRaw(clamp(n)),
    goNext: () => setStepRaw((s) => clamp(s + 1)),
    goBack: () => setStepRaw((s) => clamp(s - 1)),
    isFirst: step === 1,
    isLast: step === totalSteps,
  };
}
