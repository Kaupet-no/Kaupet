import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "@/lib/api-keys.server";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const listCategoriesApi = vi.fn();

vi.mock("@/lib/api-keys.server", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-keys.server")>("@/lib/api-keys.server");
  return { ...actual, authenticateApiKey: (...args: unknown[]) => authenticateApiKey(...args) };
});

vi.mock("@/lib/api-rate-limit.server", () => ({
  consumeApiRateLimit: (...args: unknown[]) => consumeApiRateLimit(...args),
  apiRateLimitHeaders: (result: {
    limit: number;
    remaining: number;
    allowed: boolean;
    retryAfterSeconds: number;
  }) => {
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": "0",
    };
    if (!result.allowed) headers["Retry-After"] = String(result.retryAfterSeconds);
    return headers;
  },
}));

vi.mock("@/features/listing-api/listing-api.server", () => ({
  listCategoriesApi: (...args: unknown[]) => listCategoriesApi(...args),
}));

function auth(scopes: string[] = ["listings:read"]) {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes,
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

async function get() {
  const { Route } = await import("./index");
  const request = new Request("http://localhost/api/v1/categories", {
    headers: { authorization: "Bearer kpt_live_x" },
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.GET({ request, params: {} });
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  listCategoriesApi.mockReset();
});

describe("GET /api/v1/categories", () => {
  it("401 ved manglende/ugyldig nøkkel", async () => {
    authenticateApiKey.mockRejectedValue(
      new ApiAuthError(401, "missing_key", "Mangler eller ugyldig API-nøkkel."),
    );
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("missing_key");
  });

  it("401 for utløpt nøkkel", async () => {
    authenticateApiKey.mockRejectedValue(
      new ApiAuthError(401, "expired", "Denne API-nøkkelen er utløpt."),
    );
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("expired");
  });

  it("401 for tilbakekalt nøkkel", async () => {
    authenticateApiKey.mockRejectedValue(
      new ApiAuthError(401, "revoked", "Denne API-nøkkelen er tilbakekalt."),
    );
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("revoked");
  });

  it("403 når nøkkelen mangler scope", async () => {
    authenticateApiKey.mockResolvedValue(auth([]));
    consumeApiRateLimit.mockResolvedValue(allowedRateLimit());
    const res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("insufficient_scope");
    expect(listCategoriesApi).not.toHaveBeenCalled();
  });

  it("429 med Retry-After og X-RateLimit-*-headere når grensen er nådd", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue({
      allowed: false,
      kind: "read",
      limit: 300,
      remaining: 0,
      resetAt: new Date(Date.now() + 1000),
      retryAfterSeconds: 1,
    });
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("200 med kategoriene og X-RateLimit-*-headere på et gyldig kall", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(allowedRateLimit());
    listCategoriesApi.mockResolvedValue([
      { id: "1", slug: "sykler", name: "Sykler", parentId: null },
    ]);

    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [{ id: "1", slug: "sykler", name: "Sykler", parentId: null }],
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("300");
  });
});
