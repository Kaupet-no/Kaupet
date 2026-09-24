import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const listListingsApi = vi.fn();

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
  listListingsApi: (...args: unknown[]) => listListingsApi(...args),
}));

function auth() {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes: ["listings:read"],
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  listListingsApi.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue({
    allowed: true,
    kind: "read",
    limit: 300,
    remaining: 299,
    resetAt: new Date(),
    retryAfterSeconds: 0,
  });
});

describe("GET /api/v1/listings", () => {
  it("videresender query-parametre og returnerer siden fra tjenestelaget", async () => {
    listListingsApi.mockResolvedValue({ items: [], nextCursor: null });
    const { Route } = await import("./index");
    const request = new Request("http://localhost/api/v1/listings?status=active&limit=10", {
      headers: { authorization: "Bearer kpt_live_x" },
    });
    // @ts-expect-error server handlers er tilgjengelig i praksis
    const res = await Route.options.server.handlers.GET({ request });
    expect(res.status).toBe(200);
    const [{ searchParams }] = listListingsApi.mock.calls[0];
    expect(searchParams.get("status")).toBe("active");
    expect(searchParams.get("limit")).toBe("10");
  });
});
