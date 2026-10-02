import { useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { readInterpretedSearchState } from "./submit-search";

/** Nye søk kan navigere til samme rute uten at resultatsiden monteres på nytt. */
export function useSearchInterpretation() {
  const navigationState = useLocation({ select: (location) => location.state });
  const [previousState, setPreviousState] = useState(navigationState);
  const [criteria, setCriteria] = useState(() => readInterpretedSearchState(navigationState));

  if (navigationState !== previousState) {
    setPreviousState(navigationState);
    // En eksplisitt tom tolkning (f.eks. et lagret søk) erstatter også den
    // gamle. Vanlige filter-/fanebytter uten tolkning beholder lokale endringer.
    if ("interpretedCriteria" in navigationState) {
      setCriteria(readInterpretedSearchState(navigationState));
    }
  }

  return [criteria, setCriteria] as const;
}
