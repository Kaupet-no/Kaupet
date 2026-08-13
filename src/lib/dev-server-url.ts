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
