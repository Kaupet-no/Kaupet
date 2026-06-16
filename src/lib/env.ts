/**
 * Generic environment detection based on hostname.
 * Test environment = test.kaupet.no (or test.localhost for local dev).
 * Used to switch payment APIs to test mode, show test banner, gate access, etc.
 */

export const TEST_HOSTS = ["test.kaupet.no", "test.localhost"];

export function isTestHost(host?: string | null): boolean {
  if (!host) return false;
  const h = host.split(":")[0].toLowerCase();
  return TEST_HOSTS.includes(h);
}

/** Client-side check. Returns false during SSR. */
export function isTestEnvClient(): boolean {
  if (typeof window === "undefined") return false;
  return isTestHost(window.location.hostname);
}

import { useEffect, useState } from "react";

/** React hook — returns false on first render (SSR-safe), true after mount if on test host. */
export function useIsTestEnv(): boolean {
  const [isTest, setIsTest] = useState(false);
  useEffect(() => {
    setIsTest(isTestEnvClient());
  }, []);
  return isTest;
}

