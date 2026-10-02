const isVisible = (el: HTMLElement) => el.getClientRects().length > 0;

/** Brukeren har gått videre: et ventende fokus skal ikke stjele fokus. */
const CANCEL_EVENTS = ["pointerdown", "keydown", "popstate"] as const;

/**
 * Fokuserer elementet synkront hvis det finnes og er synlig (WKWebView åpner
 * bare tastaturet når focus() skjer i selve trykket). Ellers ventes det til
 * det dukker opp (f.eks. route-chunk som ikke er montert ennå), maks
 * `timeoutMs`, eller til brukeren trykker, taster eller går tilbake.
 */
export function focusWhenReady(
  find: () => HTMLInputElement | null,
  { timeoutMs = 3000, scroll = false }: { timeoutMs?: number; scroll?: boolean } = {},
): void {
  const tryFocus = () => {
    const el = find();
    if (!el || !isVisible(el)) return false;
    if (scroll) el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: scroll });
    return true;
  };
  if (tryFocus()) return;

  const observer = new MutationObserver(() => {
    if (tryFocus()) stop();
  });
  const timer = setTimeout(stop, timeoutMs);
  function stop() {
    observer.disconnect();
    clearTimeout(timer);
    for (const type of CANCEL_EVENTS) window.removeEventListener(type, stop, true);
  }
  for (const type of CANCEL_EVENTS) window.addEventListener(type, stop, true);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
}
