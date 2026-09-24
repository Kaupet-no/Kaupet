import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const upsertListingApi = vi.fn();
const getListingApi = vi.fn();

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
  upsertListingApi: (...args: unknown[]) => upsertListingApi(...args),
  getListingApi: (...args: unknown[]) => getListingApi(...args),
}));

function auth(scopes = ["listings:read", "listings:write"]) {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes,
  };
}
function allowedRateLimit(kind: "read" | "write" = "write") {
  return {
    allowed: true,
    kind,
    limit: 120,
    remaining: 119,
    resetAt: new Date(),
    retryAfterSeconds: 0,
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  upsertListingApi.mockReset();
  getListingApi.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue(allowedRateLimit());
});

async function put(externalRef: string, body: unknown, query = "") {
  const { Route } = await import("./index");
  const request = new Request(`http://localhost/api/v1/listings/${externalRef}${query}`, {
    method: "PUT",
    headers: { authorization: "Bearer kpt_live_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.PUT({ request, params: { externalRef } });
}

describe("PUT /api/v1/listings/{externalRef}", () => {
  it("gir 201 når annonsen ble opprettet", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-1",
    });
    const res = await put("SKU-1", {
      category: "sykler",
      title: "x",
      description: "y",
      price: 100,
    });
    expect(res.status).toBe(201);
  });

  it("gir 200 når annonsen ble oppdatert/uendret", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "unchanged",
      externalRef: "SKU-1",
    });
    const res = await put("SKU-1", {
      category: "sykler",
      title: "x",
      description: "y",
      price: 100,
    });
    expect(res.status).toBe(200);
  });

  it("videresender ?dryRun=true til tjenestelaget uten å endre svarkoden", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-1",
    });
    await put(
      "SKU-1",
      { category: "sykler", title: "x", description: "y", price: 100 },
      "?dryRun=true",
    );
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({ externalRef: "SKU-1", dryRun: true }),
    );
  });

  it("videresender dryRun=false som standard", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-1",
    });
    await put("SKU-1", { category: "sykler", title: "x", description: "y", price: 100 });
    expect(upsertListingApi).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it("gir 422 med feltnavn ved valideringsfeil fra tjenestelaget", async () => {
    upsertListingApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: "Tittelen må ha minst 5 tegn.",
      field: "title",
    });
    const res = await put("SKU-1", {
      category: "sykler",
      title: "x",
      description: "y",
      price: 100,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.field).toBe("title");
  });

  it("403 når skrivescope mangler", async () => {
    authenticateApiKey.mockResolvedValue(auth(["listings:read"]));
    const res = await put("SKU-1", {
      category: "sykler",
      title: "x",
      description: "y",
      price: 100,
    });
    expect(res.status).toBe(403);
    expect(upsertListingApi).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/listings/{externalRef}", () => {
  async function get(externalRef: string) {
    const { Route } = await import("./index");
    const request = new Request(`http://localhost/api/v1/listings/${externalRef}`, {
      headers: { authorization: "Bearer kpt_live_x" },
    });
    // @ts-expect-error server handlers er tilgjengelig i praksis
    return Route.options.server.handlers.GET({ request, params: { externalRef } });
  }

  it("200 med annonsen", async () => {
    getListingApi.mockResolvedValue({ externalRef: "SKU-1", status: "active", images: [] });
    const res = await get("SKU-1");
    expect(res.status).toBe(200);
    expect((await res.json()).externalRef).toBe("SKU-1");
  });

  it("404 når referansen ikke finnes", async () => {
    getListingApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 404,
      code: "not_found",
      message: "Fant ingen annonse.",
    });
    const res = await get("ukjent");
    expect(res.status).toBe(404);
  });
});
