import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const renewListingsApi = vi.fn();

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
  renewListingsApi: (...args: unknown[]) => renewListingsApi(...args),
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
  renewListingsApi.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue({
    allowed: true,
    kind: "batch",
    limit: 10,
    remaining: 9,
    resetAt: new Date(),
    retryAfterSeconds: 0,
  });
});

async function post(body: unknown) {
  const { Route } = await import("./renew");
  const request = new Request("http://localhost/api/v1/listings/renew", {
    method: "POST",
    headers: { authorization: "Bearer kpt_live_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

describe("POST /api/v1/listings/renew", () => {
  it("teller som batch-kall", async () => {
    renewListingsApi.mockResolvedValue({
      importId: "imp-1",
      renewed: 1,
      reactivated: 0,
      skipped: 0,
      notFound: [],
    });
    await post({ externalRefs: ["a"] });
    expect(consumeApiRateLimit).toHaveBeenCalledWith("key-1", "batch");
  });

  it("gir 422 med feltnavn «externalRefs» ved for mange referanser", async () => {
    renewListingsApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: "Maks 1000 eksterne referanser per kall.",
      field: "externalRefs",
    });
    const res = await post({ externalRefs: new Array(1001).fill("x") });
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("externalRefs");
  });

  it("returnerer fornyelsesresultatet", async () => {
    renewListingsApi.mockResolvedValue({
      importId: "imp-1",
      renewed: 3,
      reactivated: 1,
      skipped: 0,
      notFound: ["ukjent"],
    });
    const res = await post({ externalRefs: ["a", "b", "c", "ukjent"] });
    const body = await res.json();
    expect(body).toEqual({
      importId: "imp-1",
      renewed: 3,
      reactivated: 1,
      skipped: 0,
      notFound: ["ukjent"],
    });
  });
});
