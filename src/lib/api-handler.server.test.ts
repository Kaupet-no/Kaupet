import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();

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
    resetAt: Date;
    retryAfterSeconds: number;
    allowed: boolean;
  }) => {
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
    };
    if (!result.allowed) headers["Retry-After"] = String(result.retryAfterSeconds);
    return headers;
  },
}));

function rateLimitResult(
  overrides?: Partial<{ allowed: boolean; remaining: number; limit: number }>,
) {
  return {
    allowed: true,
    kind: "read" as const,
    limit: 300,
    remaining: 299,
    resetAt: new Date(Date.now() + 3600_000),
    retryAfterSeconds: 3600,
    ...overrides,
  };
}

function auth(overrides?: Partial<{ scopes: string[] }>) {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes: ["listings:read", "listings:write"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
});

describe("withApiHandler", () => {
  it("gir 401 med feilkoden fra ApiAuthError når nøkkelen er ugyldig", async () => {
    const { ApiAuthError } = await import("@/lib/api-keys.server");
    authenticateApiKey.mockRejectedValue(
      new ApiAuthError(401, "invalid_key", "Ugyldig API-nøkkel."),
    );
    const { withApiHandler } = await import("@/lib/api-handler.server");

    const res = await withApiHandler(
      "read",
      "listings:read",
      async () => new Response("ok"),
    )({
      request: new Request("http://localhost/api/v1/categories"),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_key");
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });

  it("gir 403 insufficient_scope når nøkkelen mangler scopet, og teller kallet mot rategrensen", async () => {
    authenticateApiKey.mockResolvedValue(auth({ scopes: ["listings:read"] }));
    consumeApiRateLimit.mockResolvedValue(rateLimitResult());
    const { withApiHandler } = await import("@/lib/api-handler.server");

    const handler = vi.fn();
    const res = await withApiHandler(
      "write",
      "listings:write",
      handler,
    )({
      request: new Request("http://localhost/api/v1/listings/x", { method: "PUT" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
    expect(handler).not.toHaveBeenCalled();
    expect(consumeApiRateLimit).toHaveBeenCalledWith("key-1", "write");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("300");
  });

  it("gir 429 med Retry-After og X-RateLimit-*-headere når grensen er nådd", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(rateLimitResult({ allowed: false, remaining: 0 }));
    const { withApiHandler } = await import("@/lib/api-handler.server");

    const handler = vi.fn();
    const res = await withApiHandler(
      "read",
      "listings:read",
      handler,
    )({
      request: new Request("http://localhost/api/v1/categories"),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(handler).not.toHaveBeenCalled();
  });

  it("kaller handleren og setter X-RateLimit-*-headere på et vellykket svar", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(rateLimitResult());
    const { withApiHandler } = await import("@/lib/api-handler.server");

    const res = await withApiHandler("read", "listings:read", async ({ auth: a }) =>
      Response.json({ organizationId: a.organizationId }),
    )({ request: new Request("http://localhost/api/v1/categories") });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organizationId: "org-1" });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("300");
  });

  it("mapper en forretningsfeil (status/code/message/field) til riktig JSON-svar", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(rateLimitResult());
    const { withApiHandler } = await import("@/lib/api-handler.server");

    const res = await withApiHandler("write", "listings:write", async () => {
      throw {
        isApiBusinessError: true,
        status: 422,
        code: "validation_error",
        message: "Oppgi en tittel.",
        field: "title",
      };
    })({ request: new Request("http://localhost/api/v1/listings/x", { method: "PUT" }) });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "validation_error", message: "Oppgi en tittel.", field: "title" },
    });
  });

  it("viser ikke meldingen fra feil som bare ligner forretningsfeil (uten markør)", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(rateLimitResult());
    const { withApiHandler } = await import("@/lib/api-handler.server");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await withApiHandler("read", "listings:read", async () => {
      throw { status: 400, code: "storage_error", message: "intern bucket-sti" };
    })({ request: new Request("http://localhost/api/v1/categories") });

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("bucket");
  });

  it("gir en generisk 500 for uventede feil, uten å lekke detaljer", async () => {
    authenticateApiKey.mockResolvedValue(auth());
    consumeApiRateLimit.mockResolvedValue(rateLimitResult());
    const { withApiHandler } = await import("@/lib/api-handler.server");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await withApiHandler("read", "listings:read", async () => {
      throw new Error("stack trace med hemmeligheter");
    })({ request: new Request("http://localhost/api/v1/categories") });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("hemmeligheter");
    consoleError.mockRestore();
  });
});
