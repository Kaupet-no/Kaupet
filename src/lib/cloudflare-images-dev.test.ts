import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatformProxy } = vi.hoisted(() => ({ getPlatformProxy: vi.fn() }));

vi.mock("wrangler", () => ({ getPlatformProxy }));

import {
  CLOUDFLARE_IMAGES_DEV_SYMBOL,
  CLOUDFLARE_WORKERS_DEV_ID,
  cloudflareImagesDev,
} from "../../scripts/cloudflare-images-dev";

let previousCfFetchSetting: string | undefined;

describe("cloudflareImagesDev", () => {
  beforeEach(() => {
    previousCfFetchSetting = process.env.CLOUDFLARE_CF_FETCH_ENABLED;
    getPlatformProxy.mockReset();
    delete (globalThis as typeof globalThis & { [CLOUDFLARE_IMAGES_DEV_SYMBOL]?: unknown })[
      CLOUDFLARE_IMAGES_DEV_SYMBOL
    ];
  });

  afterEach(() => {
    if (previousCfFetchSetting === undefined) delete process.env.CLOUDFLARE_CF_FETCH_ENABLED;
    else process.env.CLOUDFLARE_CF_FETCH_ENABLED = previousCfFetchSetting;
  });

  it("provides only the isolated IMAGES binding to SSR and disposes it on close", async () => {
    const images = { input: vi.fn() };
    const dispose = vi.fn(async () => {});
    getPlatformProxy.mockResolvedValue({ env: { IMAGES: images, SECRET: "hidden" }, dispose });
    const plugin = cloudflareImagesDev();
    const resolveId = plugin.resolveId as (
      source: string,
      importer: string | undefined,
      options: { ssr?: boolean },
    ) => string | null;

    expect(plugin.apply).toBe("serve");
    expect(resolveId("cloudflare:workers", undefined, { ssr: true })).toBe(
      CLOUDFLARE_WORKERS_DEV_ID,
    );
    expect(resolveId("cloudflare:workers", undefined, { ssr: false })).toBeNull();
    expect(resolveId("cloudflare:workers/extra", undefined, { ssr: true })).toBeNull();
    expect((plugin.load as (id: string) => string | null)(CLOUDFLARE_WORKERS_DEV_ID)).toContain(
      'Symbol.for("kaupet.cloudflare-images-dev")',
    );

    await (plugin.configureServer as (server: never) => Promise<void>)(undefined as never);

    expect(getPlatformProxy).toHaveBeenCalledWith({
      configPath: expect.stringContaining("wrangler.images-dev.jsonc"),
      envFiles: [],
      persist: false,
      remoteBindings: false,
    });
    expect(
      (globalThis as typeof globalThis & { [CLOUDFLARE_IMAGES_DEV_SYMBOL]?: unknown })[
        CLOUDFLARE_IMAGES_DEV_SYMBOL
      ],
    ).toEqual({ IMAGES: images });

    await (plugin.closeBundle as () => Promise<void>).call({});

    expect(
      (globalThis as typeof globalThis & { [CLOUDFLARE_IMAGES_DEV_SYMBOL]?: unknown })[
        CLOUDFLARE_IMAGES_DEV_SYMBOL
      ],
    ).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
