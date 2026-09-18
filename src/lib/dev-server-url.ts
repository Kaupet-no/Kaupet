import { nativePlatform } from "@/lib/native";

export function localDevServerUrl(address: string): URL | null {
  const match = address.trim().match(/^(localhost|\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (!match) return null;

  const [, host, portText] = match;
  const port = Number(portText);
  if (port < 1 || port > 65_535) return null;

  if (host !== "localhost") {
    const octets = host.split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    const [a, b] = octets;
    const privateAddress =
      a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    if (!privateAddress) return null;
  }

  const url = new URL("http://localhost");
  url.hostname = host;
  url.port = String(port);
  return url;
}

/**
 * Oversetter localhost til loopback-adressen på Android.
 *
 * Capacitor eier Android-WebViewens egen localhost-origin, så en utviklers
 * localhost-adresse lagret nativt ville aldri nå vertsmaskinen gjennom
 * adb reverse. Denne funksjonen mapper localhost til 127.0.0.1 på Android
 * slik at adb reverse kan nå fram.
 *
 * iOS og web berøres ikke. Private IP-adresser blir heller ikke rørt.
 *
 * Samme logikk finnes i capacitor-shell/index.html, som er en frittstående
 * side uten bundler og må derfor ha sin egen kopi.
 */
export function androidNavigationUrl(url: URL): URL {
  if (url.hostname !== "localhost") {
    return url;
  }

  if (nativePlatform() !== "android") {
    return url;
  }

  const target = new URL(url.href);
  target.hostname = "127.0.0.1";
  return target;
}
