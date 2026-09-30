import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

export const CLOUDFLARE_WORKERS_DEV_ID = "\0kaupet:cloudflare-workers-dev";
export const CLOUDFLARE_IMAGES_DEV_SYMBOL = Symbol.for("kaupet.cloudflare-images-dev");

type DevGlobal = typeof globalThis & { [CLOUDFLARE_IMAGES_DEV_SYMBOL]?: { IMAGES?: unknown } };

export function cloudflareImagesDev(): Plugin {
  let dispose: (() => Promise<void>) | undefined;
  let bindings: { IMAGES?: unknown } | undefined;

  return {
    name: "kaupet-cloudflare-images-dev",
    apply: "serve",
    enforce: "pre",
    resolveId(source, _importer, options) {
      return source === "cloudflare:workers" && options?.ssr ? CLOUDFLARE_WORKERS_DEV_ID : null;
    },
    load(id) {
      if (id !== CLOUDFLARE_WORKERS_DEV_ID) return null;
      return `export const env = globalThis[Symbol.for("kaupet.cloudflare-images-dev")];`;
    },
    async configureServer() {
      process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
      const { getPlatformProxy } = await import("wrangler");
      const proxy = await getPlatformProxy({
        configPath: fileURLToPath(new URL("./wrangler.images-dev.jsonc", import.meta.url)),
        envFiles: [],
        persist: false,
        remoteBindings: false,
      });
      bindings = { IMAGES: proxy.env.IMAGES };
      (globalThis as DevGlobal)[CLOUDFLARE_IMAGES_DEV_SYMBOL] = bindings;
      dispose = proxy.dispose;
    },
    async closeBundle() {
      if ((globalThis as DevGlobal)[CLOUDFLARE_IMAGES_DEV_SYMBOL] === bindings) {
        delete (globalThis as DevGlobal)[CLOUDFLARE_IMAGES_DEV_SYMBOL];
      }
      await dispose?.();
      bindings = undefined;
      dispose = undefined;
    },
  };
}
