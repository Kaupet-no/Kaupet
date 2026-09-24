import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const replaceListingImagesApi = vi.fn();

vi.mock("@/lib/api-keys.server", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-keys.server")>("@/lib/api-keys.server");
  return { ...actual, authenticateApiKey: (...args: unknown[]) => authenticateApiKey(...args) };
});

vi.mock("@/lib/api-rate-limit.server", () => ({
  consumeApiRateLimit: (...args: unknown[]) => consumeApiRateLimit(...args),
  apiRateLimitHeaders: () => ({}),
}));

vi.mock("@/features/listing-api/listing-api.server", () => ({
  replaceListingImagesApi: (...args: unknown[]) => replaceListingImagesApi(...args),
}));

function auth() {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes: ["listings:write"],
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  replaceListingImagesApi.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue({
    allowed: true,
    kind: "write",
    limit: 120,
    remaining: 119,
    resetAt: new Date(),
    retryAfterSeconds: 0,
  });
});

async function put(externalRef: string, options: { contentType?: string; body?: string }) {
  const { Route } = await import("./images");
  const request = new Request(`http://localhost/api/v1/listings/${externalRef}/images`, {
    method: "PUT",
    headers: {
      authorization: "Bearer kpt_live_x",
      "content-type": options.contentType ?? "application/json",
    },
    body: options.body ?? JSON.stringify({ urls: ["https://example.com/a.jpg"] }),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.PUT({ request, params: { externalRef } });
}

describe("PUT /api/v1/listings/{externalRef}/images", () => {
  it("415 for multipart-opplasting (ikke støttet i v1)", async () => {
    const res = await put("SKU-1", {
      contentType: "multipart/form-data; boundary=x",
      body: "--x--",
    });
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("unsupported_media_type");
    expect(replaceListingImagesApi).not.toHaveBeenCalled();
  });

  it("200 med jobbstatus per bilde ved en gyldig JSON-body", async () => {
    replaceListingImagesApi.mockResolvedValue({
      externalRef: "SKU-1",
      images: [{ sourceUrl: "https://example.com/a.jpg", status: "pending", url: null }],
    });
    const res = await put("SKU-1", {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toHaveLength(1);
  });

  it("404 når annonsen ikke finnes", async () => {
    replaceListingImagesApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 404,
      code: "not_found",
      message: "Fant ingen annonse.",
    });
    const res = await put("ukjent", {});
    expect(res.status).toBe(404);
  });
});
