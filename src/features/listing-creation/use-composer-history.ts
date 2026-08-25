import { useEffect, useRef } from "react";

/** Keeps physical/browser back inside a multi-step composer until step one. */
export function useComposerHistoryBack(isFirst: boolean, goBack: () => void) {
  const isFirstRef = useRef(isFirst);
  const goBackRef = useRef(goBack);

  useEffect(() => {
    isFirstRef.current = isFirst;
    goBackRef.current = goBack;
  }, [isFirst, goBack]);

  useEffect(() => {
    window.history.pushState({ composerGuard: true }, "");

    function onPopState(event: PopStateEvent) {
      if (isFirstRef.current || (event.state as { composerGuard?: boolean } | null)?.composerGuard)
        return;
      goBackRef.current();
      window.history.pushState({ composerGuard: true }, "");
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
