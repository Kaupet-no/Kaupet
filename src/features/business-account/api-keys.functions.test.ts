import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = { from: vi.fn(), rpc: vi.fn(), auth: { admin: {} } };

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: input.context ?? defaultContext });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      middleware: () => fn,
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const generateApiKey = vi.fn(async () => ({
  plaintext: "kpt_live_generated-plaintext",
  prefix: "kpt_live_gen",
  hash: "a".repeat(64),
}));
vi.mock("@/lib/api-keys.server", () => ({
  generateApiKey: () => generateApiKey(),
}));

const peekApiRateLimit = vi.fn(async (_keyId: string, _kind: string) => ({
  allowed: true,
  kind: "read",
  limit: 300,
  remaining: 300,
  resetAt: new Date("2026-09-24T12:00:00.000Z"),
  retryAfterSeconds: 0,
}));
vi.mock("@/lib/api-rate-limit.server", () => ({
  peekApiRateLimit: (keyId: string, kind: string) => peekApiRateLimit(keyId, kind),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const superuserId = "22222222-2222-4222-8222-222222222222";
const locationId = "44444444-4444-4444-8444-444444444444";
const keyId = "55555555-5555-4555-8555-555555555555";

const defaultContext = { userId: superuserId };

function makeQueryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const chainable = ["select", "eq", "order", "gte", "gt", "in", "is"];
  for (const method of chainable) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: typeof result) => void) => resolve(result);
  return chain;
}

function mockFrom(options: {
  membership?: Record<string, unknown> | null;
  keys?: Record<string, unknown>[];
  counts?: Partial<Record<"organization_listing_imports" | "listing_image_jobs", number>>;
}) {
  const membership =
    options.membership === undefined
      ? { organization_id: organizationId, role: "superuser", status: "active" }
      : options.membership;

  supabaseAdmin.from.mockImplementation((table: string) => {
    if (table === "organization_members") {
      return makeQueryChain({ data: membership, error: null });
    }
    if (table === "organization_api_keys") {
      return makeQueryChain({ data: options.keys ?? [], error: null });
    }
    if (table === "organization_listing_imports" || table === "listing_image_jobs") {
      return makeQueryChain({
        data: null,
        error: null,
        count:
          options.counts?.[table as "organization_listing_imports" | "listing_image_jobs"] ?? 0,
      } as never);
    }
    return makeQueryChain({ data: null, error: null });
  });
}

beforeEach(() => {
  supabaseAdmin.from.mockReset();
  supabaseAdmin.rpc.mockReset();
  generateApiKey.mockClear();
  peekApiRateLimit.mockClear();
});

import { createApiKey, getIntegrationUsage, listApiKeys, revokeApiKey } from "./api-keys.functions";

describe("listApiKeys", () => {
  it("rejects a non-superuser member", async () => {
    mockFrom({ membership: { organization_id: organizationId, role: "member", status: "active" } });
    await expect(listApiKeys()).rejects.toThrow("Du har ikke tilgang til API-nøkler.");
  });

  it("rejects a user with no active membership", async () => {
    mockFrom({ membership: null });
    await expect(listApiKeys()).rejects.toThrow("Du har ikke tilgang til API-nøkler.");
  });

  it("returns the organization's keys for a superuser", async () => {
    mockFrom({
      keys: [
        {
          id: keyId,
          name: "Lagersystem",
          key_prefix: "kpt_live_ab12",
          default_location_id: locationId,
          scopes: ["listings:read"],
          created_at: "2026-09-01T00:00:00.000Z",
          expires_at: "2026-12-01T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
        },
      ],
    });
    const result = await listApiKeys();
    expect(result.keys).toEqual([
      expect.objectContaining({ id: keyId, name: "Lagersystem", keyPrefix: "kpt_live_ab12" }),
    ]);
  });
});

describe("createApiKey", () => {
  it("rejects an invalid lifetime before calling the RPC", () => {
    mockFrom({});
    expect(() =>
      createApiKey({
        data: {
          name: "Test",
          defaultLocationId: locationId,
          scopes: ["listings:read"],
          lifetimeDays: 45,
        },
      } as never),
    ).toThrow();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-superuser before generating a key", async () => {
    mockFrom({ membership: { organization_id: organizationId, role: "member", status: "active" } });
    await expect(
      createApiKey({
        data: {
          name: "Test",
          defaultLocationId: locationId,
          scopes: ["listings:read"],
          lifetimeDays: 90,
        },
      } as never),
    ).rejects.toThrow("Du har ikke tilgang til API-nøkler.");
    expect(generateApiKey).not.toHaveBeenCalled();
  });

  it("forwards the '2 active keys' error from the RPC verbatim", async () => {
    mockFrom({});
    const message = "Dere har allerede 2 aktive nøkler. Tilbakekall én før du oppretter en ny.";
    supabaseAdmin.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message } });

    await expect(
      createApiKey({
        data: {
          name: "Test",
          defaultLocationId: locationId,
          scopes: ["listings:read"],
          lifetimeDays: 90,
        },
      } as never),
    ).rejects.toThrow(message);
  });

  it("sanitizes an unexpected database error", async () => {
    mockFrom({});
    supabaseAdmin.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection lost" },
    });

    await expect(
      createApiKey({
        data: {
          name: "Test",
          defaultLocationId: locationId,
          scopes: ["listings:read"],
          lifetimeDays: 90,
        },
      } as never),
    ).rejects.toThrow("Noe gikk galt. Prøv igjen senere.");
  });

  it("returns the plaintext key once on success", async () => {
    mockFrom({});
    supabaseAdmin.rpc.mockResolvedValue({
      data: {
        id: keyId,
        name: "Test",
        key_prefix: "kpt_live_gen",
        default_location_id: locationId,
        scopes: ["listings:read"],
        created_at: "2026-09-24T00:00:00.000Z",
        expires_at: "2026-12-23T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
      },
      error: null,
    });

    const result = await createApiKey({
      data: {
        name: "Test",
        defaultLocationId: locationId,
        scopes: ["listings:read"],
        lifetimeDays: 90,
      },
    } as never);
    expect(result.plaintext).toBe("kpt_live_generated-plaintext");
    expect(result.key.id).toBe(keyId);
  });
});

describe("revokeApiKey", () => {
  it("rejects a non-superuser", async () => {
    mockFrom({ membership: { organization_id: organizationId, role: "member", status: "active" } });
    await expect(revokeApiKey({ data: { keyId } } as never)).rejects.toThrow(
      "Du har ikke tilgang til API-nøkler.",
    );
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("forwards the RPC's own authorization error verbatim", async () => {
    mockFrom({});
    supabaseAdmin.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Du har ikke tilgang til å tilbakekalle denne nøkkelen." },
    });
    await expect(revokeApiKey({ data: { keyId } } as never)).rejects.toThrow(
      "Du har ikke tilgang til å tilbakekalle denne nøkkelen.",
    );
  });

  it("succeeds for a superuser", async () => {
    mockFrom({});
    supabaseAdmin.rpc.mockResolvedValue({ data: null, error: null });
    await expect(revokeApiKey({ data: { keyId } } as never)).resolves.toBeUndefined();
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "revoke_organization_api_key",
      expect.objectContaining({ _key_id: keyId, _user_id: superuserId }),
    );
  });
});

describe("getIntegrationUsage", () => {
  it("rejects a non-superuser", async () => {
    mockFrom({ membership: { organization_id: organizationId, role: "member", status: "active" } });
    await expect(getIntegrationUsage()).rejects.toThrow("Du har ikke tilgang til API-nøkler.");
  });

  it("returns limits from the shared configuration module", async () => {
    mockFrom({ keys: [{ id: keyId }] });
    const usage = await getIntegrationUsage();
    expect(usage.limits.apiKey.readPerHour).toBeGreaterThan(0);
    expect(usage.keys).toHaveLength(1);
    expect(peekApiRateLimit).toHaveBeenCalledWith(keyId, "read");
    expect(peekApiRateLimit).toHaveBeenCalledWith(keyId, "write");
    expect(peekApiRateLimit).toHaveBeenCalledWith(keyId, "batch");
  });
});
