import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const getCategoryFieldsApi = vi.fn();

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
  getCategoryFieldsApi: (...args: unknown[]) => getCategoryFieldsApi(...args),
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
function allowedRateLimit() {
  return {
    allowed: true,
    kind: "read",
    limit: 300,
    remaining: 299,
    resetAt: new Date(),
    retryAfterSeconds: 0,
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  getCategoryFieldsApi.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue(allowedRateLimit());
});

async function get(id: string) {
  const { Route } = await import("./fields");
  const request = new Request(`http://localhost/api/v1/categories/${id}/fields`, {
    headers: { authorization: "Bearer kpt_live_x" },
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.GET({ request, params: { id } });
}

describe("GET /api/v1/categories/{id}/fields", () => {
  it("200 med feltene fra tjenestelaget", async () => {
    getCategoryFieldsApi.mockResolvedValue([
      {
        key: "color",
        label: "Farge",
        type: "select",
        required: true,
        unit: null,
        allowedValues: null,
        dependsOn: null,
      },
    ]);
    const res = await get("cat-1");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
    expect(getCategoryFieldsApi).toHaveBeenCalledWith("cat-1");
  });

  it("404 når kategorien ikke finnes", async () => {
    getCategoryFieldsApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 404,
      code: "not_found",
      message: "Fant ikke kategorien.",
    });
    const res = await get("ukjent");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
