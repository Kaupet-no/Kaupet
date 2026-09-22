// Sikkerhetsheadere for alle svar fra Worker-en. Ligger i `src/lib/` og ikke i
// `vite.config.ts` fordi CSP-en er en stille feilkilde: da R2-migreringen endret
// bildedomenet, blokkerte `img-src` hvert `<img>` uten at noe bygg eller test
// feilet. Her kan den enhetstestes.

export type SecurityHeaderEnv = {
  /** Offentlig bildedomene for R2 (`VITE_R2_PUBLIC_BASE_URL`), f.eks.
   * `https://bilder.kaupet.no`. Prod og staging har hvert sitt. */
  r2PublicBaseUrl?: string;
  /** Cloudflare-kontoen R2 ligger i (`R2_ACCOUNT_ID`). Meldingsvedlegg ligger i
   * en privat bucket og rendres som `<img>` med presignert S3-URL på
   * `https://<account>.r2.cloudflarestorage.com` (se `src/lib/r2.server.ts`). */
  r2AccountId?: string;
  /** Supabase-URL-en klienten faktisk bruker (`VITE_SUPABASE_URL`). I prod
   * dekkes den av `*.supabase.co`; lokalt/E2E er den `http://127.0.0.1:<port>`. */
  supabaseUrl?: string;
  /** Request-local nonce for TanStack Start's SSR inline scripts. */
  scriptNonce?: string;
};

// The root route's JSON-LD is static, so a hash covers it without weakening
// script-src for arbitrary inline code.
const ROOT_JSON_LD_HASH = "'sha256-LR2kHVcI8evMuo9ZNJ5xdPHkkPKsqFHzVrZCCNWuZ4k='";

/** Kilder som mangler utelates framfor å slippe inn strengen "undefined" eller
 * et wildcard: en tom variabel skal blokkere domenet, ikke åpne det. */
function imgSrc({ r2PublicBaseUrl, r2AccountId }: SecurityHeaderEnv): string {
  return [
    "img-src 'self' data: blob:",
    r2PublicBaseUrl,
    r2AccountId && `https://${r2AccountId}.r2.cloudflarestorage.com`,
    // `*.supabase.co` blir stående: avatar-URL-er fra før R2-migreringen er
    // lagret som fulle Supabase Storage-URL-er i `profiles`.
    "https://*.supabase.co",
    "https://cache.kartverket.no",
  ]
    .filter(Boolean)
    .join(" ");
}

function connectSrc({ supabaseUrl }: SecurityHeaderEnv): string {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : undefined;
  return [
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    origin,
    origin?.replace(/^http/, "ws"),
    "https://nominatim.openstreetmap.org https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSecurityHeaders(env: SecurityHeaderEnv): Record<string, string> {
  const scriptNonce = env.scriptNonce ? `'nonce-${env.scriptNonce}'` : undefined;

  return {
    // Attribusjon på hvert svar, synlig i DevTools Network. Ren ASCII med vilje:
    // headerverdier er latin-1, så ingen em-dash her (til forskjell fra
    // `<meta name="generator">` og bundle-banneret i vite.config.ts).
    "x-powered-by": "Kaupet.no - https://kaupet.no (AGPL-3.0, https://github.com/Kaupet-no/Kaupet)",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(self), geolocation=(self), microphone=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    // SSR hydration scripts carry the request-local nonce. Static assets use
    // the same policy without a nonce; the Start middleware adds it for HTML.
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      ["script-src 'self'", scriptNonce, "https://challenges.cloudflare.com"]
        .concat(ROOT_JSON_LD_HASH)
        .filter(Boolean)
        .join(" "),
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      imgSrc(env),
      connectSrc(env),
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
      "report-to csp",
    ].join("; "),
    "reporting-endpoints": 'csp="/api/public/csp-report"',
  };
}
