import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const setListingStatusApi = vi.fn();

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
  setListingStatusApi: (...args: unknown[]) => setListingStatusApi(...args),
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
  setListingStatusApi.mockReset();
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

async function post(externalRef: string, body: unknown) {
  const { Route } = await import("./status");
  const request = new Request(`http://localhost/api/v1/listings/${externalRef}/status`, {
    method: "POST",
    headers: { authorization: "Bearer kpt_live_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request, params: { externalRef } });
}

describe("POST /api/v1/listings/{externalRef}/status", () => {
  it("setter ny status og returnerer resultatet", async () => {
    setListingStatusApi.mockResolvedValue({
      externalRef: "SKU-1",
      listingId: "l1",
      status: "sold",
      changed: true,
    });
    const res = await post("SKU-1", { status: "sold" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      externalRef: "SKU-1",
      listingId: "l1",
      status: "sold",
      changed: true,
    });
  });

  it("404 når referansen ikke finnes", async () => {
    setListingStatusApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 404,
      code: "not_found",
      message: "Fant ingen annonse.",
    });
    const res = await post("ukjent", { status: "sold" });
    expect(res.status).toBe(404);
  });

  it("422 ved ugyldig status", async () => {
    setListingStatusApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: "Status må være active, sold eller archived.",
      field: "status",
    });
    const res = await post("SKU-1", { status: "invalid" });
    expect(res.status).toBe(422);
  });
});
