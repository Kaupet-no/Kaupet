/**
 * Reduces a page URL to the route context feedback needs: path only, without
 * origin, query (search text, invitation tokens) or fragment, and with
 * capability tokens in the path replaced by a placeholder.
 */
export function sanitizeFeedbackPageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let pathname: string;
  try {
    pathname = new URL(raw, "https://kaupet.invalid").pathname;
  } catch {
    return undefined;
  }
  return pathname.replace(/^\/360-opptak\/[^/]+/, "/360-opptak/:token").slice(0, 500);
}
