import { getCookie, getRequestHost } from "@tanstack/react-start/server";
import { isTestHost, TEST_MODE_COOKIE } from "./env";

/** Returns true when the current server request is for the test domain
 *  or the caller has opted into test-modus via the kaupet_test_mode cookie. */
export function getRequestIsTest(): boolean {
  try {
    if (isTestHost(getRequestHost())) return true;
  } catch {
    // no request context
  }
  try {
    return getCookie(TEST_MODE_COOKIE) === "1";
  } catch {
    return false;
  }
}
