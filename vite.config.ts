import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Deploy target: Cloudflare Workers (module format), matching production today.
// Change `preset` here if Kaupet moves to a different host later.
const NITRO_PRESET = "cloudflare-module";

export default defineConfig(({ command, mode }) => {
  // Statically inline VITE_* env vars so they're also available in the
  // Nitro-bundled server output, not just the client bundle.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define: envDefine,
    // Vite uses PostCSS in dev and only runs Lightning CSS at build time;
    // running it in both keeps the dev preview consistent with the built
    // output (e.g. -webkit-backdrop-filter prefixing isn't dropped silently).
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
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
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
      }),
      ...(command === "build"
        ? [
            nitro({
              preset: NITRO_PRESET,
              output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
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
