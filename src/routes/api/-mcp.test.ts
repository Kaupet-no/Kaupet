import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "@/lib/api-keys.server";

const authenticateApiKey = vi.fn();
const consumeApiRateLimit = vi.fn();
const findMcpTool = vi.fn();

vi.mock("@/lib/api-keys.server", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-keys.server")>("@/lib/api-keys.server");
  return { ...actual, authenticateApiKey: (...args: unknown[]) => authenticateApiKey(...args) };
});

vi.mock("@/lib/api-rate-limit.server", () => ({
  consumeApiRateLimit: (...args: unknown[]) => consumeApiRateLimit(...args),
  apiRateLimitHeaders: () => ({}),
}));

vi.mock("@/features/listing-api/mcp-tools", () => ({
  MCP_TOOLS: [
    {
      name: "fake_tool",
      description: "Et testverktøy.",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
      scope: "listings:read",
      rateLimitKind: "read",
      execute: vi.fn(),
    },
  ],
  findMcpTool: (...args: unknown[]) => findMcpTool(...args),
}));

function auth(
  scopes: ("listings:read" | "listings:write")[] = ["listings:read", "listings:write"],
) {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes,
  };
}

function allowedRateLimit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    allowed: true,
    kind: "read",
    limit: 300,
    remaining: 299,
    resetAt: new Date("2026-01-01T00:00:00Z"),
    retryAfterSeconds: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  authenticateApiKey.mockReset();
  consumeApiRateLimit.mockReset();
  findMcpTool.mockReset();
  authenticateApiKey.mockResolvedValue(auth());
  consumeApiRateLimit.mockResolvedValue(allowedRateLimit());
});

async function post(
  body: unknown,
  options?: { headers?: Record<string, string> },
): Promise<Response> {
  const { Route } = await import("./mcp");
  const request = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer kpt_live_x",
      "content-type": "application/json",
      ...options?.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

describe("GET/DELETE /api/mcp", () => {
  it("405 for GET (stateless — ingen SSE-strøm)", async () => {
    const { Route } = await import("./mcp");
    // @ts-expect-error server handlers er tilgjengelig i praksis
    const res = await Route.options.server.handlers.GET({});
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("405 for DELETE (stateless — ingen sesjon å avslutte)", async () => {
    const { Route } = await import("./mcp");
    // @ts-expect-error server handlers er tilgjengelig i praksis
    const res = await Route.options.server.handlers.DELETE({});
    expect(res.status).toBe(405);
  });
});

describe("Autentisering", () => {
  it("401 med WWW-Authenticate når nøkkel mangler, FØR JSON-RPC parses", async () => {
    authenticateApiKey.mockRejectedValue(
      new ApiAuthError(401, "missing_key", "Mangler eller ugyldig API-nøkkel."),
    );
    const res = await post("dette er ikke gyldig JSON-RPC i det hele tatt");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
    const body = await res.json();
    expect(body.error.code).toBe("missing_key");
  });

  it("401 for en ugyldig/tilbakekalt nøkkel", async () => {
    authenticateApiKey.mockRejectedValue(new ApiAuthError(401, "revoked", "Tilbakekalt."));
    const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(res.status).toBe(401);
  });
});

describe("JSON-RPC protokoll", () => {
  it("-32700 (parse error, HTTP 400) for ugyldig JSON", async () => {
    const res = await post("{ ikke json");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeNull();
    expect(body.error.code).toBe(-32700);
  });

  it("-32600 (invalid request, HTTP 400) for batch-forespørsler", async () => {
    const res = await post([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it("-32600 når jsonrpc-versjon mangler/feiler", async () => {
    const res = await post({ id: 1, method: "ping" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it("202 uten body for en notifikasjon (ingen id)", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    const text = await res.text();
    expect(text).toBe("");
  });

  it("initialize svarer med serverInfo og tools-capability", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo).toEqual({ name: "kaupet-proff", version: "1.0.0" });
    expect(body.result.capabilities).toEqual({ tools: {} });
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("ping svarer med et tomt resultat", async () => {
    const res = await post({ jsonrpc: "2.0", id: "abc", method: "ping" });
    const body = await res.json();
    expect(body.id).toBe("abc");
    expect(body.result).toEqual({});
  });

  it("tools/list returnerer alle registrerte verktøy med gyldig skjema", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const body = await res.json();
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0]).toMatchObject({
      name: "fake_tool",
      inputSchema: { type: "object" },
    });
  });

  it("-32601 (method not found) for en ukjent metode", async () => {
    const res = await post({ jsonrpc: "2.0", id: 3, method: "does/not-exist" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("-32602 (invalid params) for tools/call mot et ukjent verktøy", async () => {
    findMcpTool.mockReturnValue(undefined);
    const res = await post({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "ukjent_verktoy" },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });
});

describe("tools/call — scope, rategrense og feil", () => {
  function fakeTool(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: "fake_tool",
      scope: "listings:read",
      rateLimitKind: "read",
      execute: vi.fn().mockResolvedValue({ text: "OK", structured: { ok: true } }),
      ...overrides,
    };
  }

  it("isError med forklaring når nøkkelen mangler scopet verktøyet krever", async () => {
    authenticateApiKey.mockResolvedValue(auth(["listings:read"]));
    findMcpTool.mockReturnValue(fakeTool({ scope: "listings:write" }));
    const res = await post({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "fake_tool", arguments: {} },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/listings:write/);
  });

  it("isError med rategrense-info i teksten når grensen er nådd", async () => {
    consumeApiRateLimit.mockResolvedValue(
      allowedRateLimit({ allowed: false, limit: 300, retryAfterSeconds: 42 }),
    );
    findMcpTool.mockReturnValue(fakeTool());
    const res = await post({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "fake_tool", arguments: {} },
    });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/300/);
    expect(body.result.content[0].text).toMatch(/42 sekunder/);
  });

  it("isError (ikke protokollfeil) for en forretningsfeil fra verktøyet", async () => {
    const execute = vi.fn().mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: "Tittelen må ha minst 5 tegn.",
      field: "title",
    });
    findMcpTool.mockReturnValue(fakeTool({ execute }));
    const res = await post({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "fake_tool", arguments: {} },
    });
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Tittelen må ha minst 5 tegn.");
    expect(body.result.content[0].text).toContain("title");
  });

  it("returnerer content + structuredContent ved suksess", async () => {
    findMcpTool.mockReturnValue(fakeTool());
    const res = await post({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "fake_tool", arguments: {} },
    });
    const body = await res.json();
    expect(body.result.content).toEqual([{ type: "text", text: "OK" }]);
    expect(body.result.structuredContent).toEqual({ ok: true });
    expect(body.result.isError).toBeUndefined();
  });

  it("isError generisk for en uventet (ikke-forretnings-) feil", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("boom"));
    findMcpTool.mockReturnValue(fakeTool({ execute }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "fake_tool", arguments: {} },
    });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/intern feil/);
    errorSpy.mockRestore();
  });
});
