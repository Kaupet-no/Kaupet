import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { buildSecurityHeaders } from "./src/lib/security-headers";

// Deploy target: Cloudflare Workers (module format), matching production today.
// Change `preset` here if Kaupet moves to a different host later.
const NITRO_PRESET = "cloudflare-module";

// Server-only secrets that features silently need at runtime. Warn early in
// dev so a missing key surfaces at `bun run dev` instead of mid-wizard when a
// user hits the feature that needs it (e.g. STATENS_VEGVESEN_API_KEY only
// errors once someone starts a Bil/MC listing).
const REQUIRED_DEV_SECRETS = ["STATENS_VEGVESEN_API_KEY"];

export default defineConfig(({ command, mode }) => {
  // Statically inline VITE_* env vars so they're also available in the
  // Nitro-bundled server output, not just the client bundle.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const allEnv = loadEnv(mode, process.cwd(), "");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  const securityHeaders = buildSecurityHeaders({
    r2PublicBaseUrl: env.VITE_R2_PUBLIC_BASE_URL,
    r2AccountId: allEnv.R2_ACCOUNT_ID,
  });

  if (command === "serve") {
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
    build: {
      rolldownOptions: {
        output: {
          // Keep large third-party packages out of the application entry
          // without grouping application modules into a circular initial chunk.
          codeSplitting: {
            maxSize: 450 * 1024,
            groups: [
              {
                name: "tanstack-router",
                test: /node_modules[\\/]@tanstack[\\/](?:react-router|router-core|history)/,
                includeDependenciesRecursively: false,
                maxSize: 450 * 1024,
                priority: 15,
              },
              {
                // seroval deserializes every serverFn response on the client and
                // has a multi-level Error class hierarchy (SerovalError extends
                // Error, SerovalParserError extends SerovalError, etc). Splitting
                // it across chunks without a guaranteed load order caused
                // "Cannot read properties of undefined (reading 'extends')"
                // crashes while parsing responses for the profile page's widgets.
                name: "seroval",
                test: /node_modules[\\/]seroval(-plugins)?[\\/]/,
                includeDependenciesRecursively: true,
                maxSize: 450 * 1024,
                priority: 15,
              },
            ],
          },
        },
      },
    },
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
              // Keep the generated Worker config on a runtime supported by
              // the Wrangler version in the lockfile. Nitro's default of
              // today's date can be one day ahead of workerd in CI.
              compatibilityDate: "2026-08-27",
              output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
              // fetch these extensionless files and expect JSON — Cloudflare's
              // static asset serving would otherwise guess a generic content
              // type from the missing file extension.
              routeRules: {
                "/**": { headers: securityHeaders },
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
                wrangler: {
                  name: process.env.CLOUDFLARE_WORKER_NAME || "kaupet-no",
                  observability: { enabled: true },
                },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
