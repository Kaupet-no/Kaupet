import { useEffect, useState } from "react";
import { isNative } from "@/lib/native";

export const STAGING_HOST = "staging.kaupet.no";

function isPrivateNetworkHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return (
    hostname === "localhost" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

/**
 * Viser DevServerSwitch kun i den native staging-appen — enten koblet mot
 * staging.kaupet.no eller allerede mot en lokal dev-server. SSR-safe: false
 * til etter mount, samme mønster som useIsNative/useIsTestEnv.
 */
export function useShouldShowDevServerSwitch(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const host = window.location.host;
    setShow(isNative() && (host === STAGING_HOST || isPrivateNetworkHost(host)));
  }, []);
  return show;
}
