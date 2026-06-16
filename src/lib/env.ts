/**
 * Generic environment detection based on hostname OR per-session cookie.
 * Test environment = test.kaupet.no, test.localhost, or an admin/demo
 * session that has opted into test-modus via the kaupet_test_mode cookie.
 * Used to switch payment APIs to test mode, show test banner, gate access, etc.
 */

export const TEST_HOSTS = ["test.kaupet.no", "test.localhost"];
export const TEST_MODE_COOKIE = "kaupet_test_mode";

export function isTestHost(host?: string | null): boolean {
  if (!host) return false;
  const h = host.split(":")[0].toLowerCase();
  return TEST_HOSTS.includes(h);
}

function hasTestModeCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${TEST_MODE_COOKIE}=1`));
}

/** Client-side check. Returns false during SSR. */
export function isTestEnvClient(): boolean {
  if (typeof window === "undefined") return false;
  return isTestHost(window.location.hostname) || hasTestModeCookie();
}

import { useEffect, useState } from "react";

/** React hook — returns false on first render (SSR-safe), true after mount if on test host or cookie is set. */
export function useIsTestEnv(): boolean {
  const [isTest, setIsTest] = useState(false);
  useEffect(() => {
    setIsTest(isTestEnvClient());
  }, []);
  return isTest;
}
