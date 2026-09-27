import { beforeEach, describe, expect, it, vi } from "vitest";

import { INTEGRATION_LIMITS } from "@/lib/integration-limits";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const batchUpsertListingsApi = vi.fn();

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
  batchUpsertListingsApi: (...args: unknown[]) => batchUpsertListingsApi(...args),
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
  batchUpsertListingsApi.mockReset();
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
  const { Route } = await import("./batch");
  const request = new Request("http://localhost/api/v1/listings/batch", {
    method: "POST",
    headers: { authorization: "Bearer kpt_live_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

describe("POST /api/v1/listings/batch", () => {
  it("teller mot batch-rategrensen, ikke read/write", async () => {
    batchUpsertListingsApi.mockResolvedValue({ importId: "imp-1", results: [] });
    await post({
      rows: [{ externalRef: "a", category: "x", title: "y", description: "z", price: 1 }],
    });
    expect(consumeApiRateLimit).toHaveBeenCalledWith("key-1", "batch");
  });

  it("gir 422 med feltnavn «rows» når raden overstiger grensen", async () => {
    batchUpsertListingsApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: `Maks ${INTEGRATION_LIMITS.maxBatchRows} rader per forespørsel.`,
      field: "rows",
    });
    const res = await post({ rows: new Array(INTEGRATION_LIMITS.maxBatchRows + 1).fill({}) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.field).toBe("rows");
  });

  it("returnerer importId og resultatlisten fra tjenestelaget", async () => {
    batchUpsertListingsApi.mockResolvedValue({
      importId: "imp-2",
      results: [{ rowNumber: 1, externalRef: "a", status: "created" }],
    });
    const res = await post({
      rows: [{ externalRef: "a", category: "x", title: "y", description: "z", price: 1 }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importId).toBe("imp-2");
    expect(body.results).toHaveLength(1);
  });
});
