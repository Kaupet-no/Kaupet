import { useEffect, useRef, useState } from "react";
import type { AdvancedSearchValue } from "@/components/advanced-search-value";

/**
 * Shared draft-state lifecycle for the advanced-search panel (native
 * full-screen sheet and desktop side sheet alike): only re-syncs the local
 * draft from `initial` when the panel transitions open, not on every
 * re-render where `initial` changes identity — so edits in progress aren't
 * silently clobbered if the underlying search state updates while the panel
 * is still open.
 */
export function useAdvancedSearchValue(open: boolean, initial: AdvancedSearchValue) {
  const [v, setV] = useState<AdvancedSearchValue>(initial);
  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  });
  useEffect(() => {
    if (open) setV(initialRef.current);
  }, [open]);
  return [v, setV] as const;
}
