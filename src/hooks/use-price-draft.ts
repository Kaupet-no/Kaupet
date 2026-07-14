import { useState } from "react";

/**
 * Shared draft-state + apply-parsing logic for the price filter, used by both
 * the native price sheet and the desktop price popover — the two previously
 * re-implemented the same min/max/includeFree draft state and parseInt-on-apply
 * logic verbatim.
 */
export function usePriceDraft(
  min: number | undefined,
  max: number | undefined,
  includeFree: boolean,
  onApply: (min: number | undefined, max: number | undefined, includeFree: boolean) => void,
) {
  const [minDraft, setMinDraft] = useState(min != null ? String(min) : "");
  const [maxDraft, setMaxDraft] = useState(max != null ? String(max) : "");
  const [freeDraft, setFreeDraft] = useState(includeFree);

  const apply = () => {
    const mn = minDraft ? parseInt(minDraft) : undefined;
    const mx = maxDraft ? parseInt(maxDraft) : undefined;
    onApply(mn, mx, freeDraft);
  };

  return { minDraft, setMinDraft, maxDraft, setMaxDraft, freeDraft, setFreeDraft, apply };
}
