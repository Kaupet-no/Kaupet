import { getRequestHost } from "@tanstack/react-start/server";
import { isTestHost } from "./env";

/** Returns true when the current server request is for the test domain. */
export function getRequestIsTest(): boolean {
  try {
    return isTestHost(getRequestHost());
  } catch {
    return false;
  }
}
