import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Deploy target: Cloudflare Workers (module format), matching production today.
// Change `preset` here if Kaupet moves to a different host later.
const NITRO_PRESET = "cloudflare-module";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), geolocation=(self), microphone=()",
  // Report-only first: the app has intentional inline bootstrap/JSON-LD and
  // third-party Turnstile/map/Supabase traffic. Promote to enforcement after
  // production reports confirm this source inventory is complete.
  "content-security-policy-report-only": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
  ].join("; "),
};

// Server-only secrets that features silently need at runtime. Warn early in
// dev so a missing key surfaces at `bun run dev` instead of mid-wizard when a
// user hits the feature that needs it (e.g. STATENS_VEGVESEN_API_KEY only
// errors once someone starts a Bil/MC listing).
const REQUIRED_DEV_SECRETS = ["STATENS_VEGVESEN_API_KEY"];

export default defineConfig(({ command, mode }) => {
  // Statically inline VITE_* env vars so they're also available in the
  // Nitro-bundled server output, not just the client bundle.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  if (command === "serve") {
    const allEnv = loadEnv(mode, process.cwd(), "");
    const missing = REQUIRED_DEV_SECRETS.filter((key) => !allEnv[key]);
    if (missing.length > 0) {
      console.warn(
        `\n⚠️  Mangler miljøvariabler i .env: ${missing.join(", ")}\n` +
          `   Funksjoner som er avhengige av disse vil feile ved bruk (se .env.example).\n`,
      );
    }
  }

  return {
    define: envDefine,
    // Vite uses PostCSS in dev and only runs Lightning CSS at build time;
    // running it in both keeps the dev preview consistent with the built
    // output (e.g. -webkit-backdrop-filter prefixing isn't dropped silently).
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      tsconfigPaths: true,
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**", "**/*.server.ts", "**/*.server.tsx"],
            specifiers: ["server-only"],
          },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
      }),
      ...(command === "build"
        ? [
            nitro({
              preset: NITRO_PRESET,
              output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
              // Universal Links (iOS) / App Links (Android): Apple/Google
              // fetch these extensionless files and expect JSON — Cloudflare's
              // static asset serving would otherwise guess a generic content
              // type from the missing file extension.
              routeRules: {
                "/**": { headers: SECURITY_HEADERS },
                "/.well-known/apple-app-site-association": {
                  headers: { "content-type": "application/json" },
                },
                "/.well-known/assetlinks.json": {
                  headers: { "content-type": "application/json" },
                },
              },
              cloudflare: {
                nodeCompat: true,
                deployConfig: true,
                // Wrangler's redirected-config mode (used by Nitro's
                // deployConfig) rejects `env.*` blocks, so the worker name
                // for non-prod targets is selected via env var instead.
                wrangler: { name: process.env.CLOUDFLARE_WORKER_NAME || "kaupet-no" },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
