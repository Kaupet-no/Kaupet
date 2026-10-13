// Public VAPID key — safe to expose to the browser. Shared by the client
// (subscriptions) and the dispatch endpoint (signing), so both always use the
// key the build was configured with; a mismatch makes push services reject
// every message (KG-25-F04).
// Rotated because the old private key wasn't retrievable.
// All push subscriptions created against the previous key stop working once
// this ships to production — existing subscribers must re-enable push.
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BPFo1ygL7dxhxhtTCPbE6b4qYkP9webql5QNaJuCReVeko8mzNCVyFunhDwIV95v4lKjHttAFgjxTN1zvsVvJnc";
