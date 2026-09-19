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
};

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

export function buildSecurityHeaders(env: SecurityHeaderEnv): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(self), geolocation=(self), microphone=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    // Enforce the policy. Keep the explicit inline allowance until SSR
    // hydration/bootstrap has been migrated to nonces; report-only provided no
    // protection at all.
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      imgSrc(env),
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
      "report-to csp",
    ].join("; "),
    "reporting-endpoints": 'csp="/api/public/csp-report"',
  };
}
