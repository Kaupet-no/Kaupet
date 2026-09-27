import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
const supabaseAdmin = { rpc: rpcMock };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import {
  ApiAuthError,
  API_KEY_PREFIX,
  authenticateApiKey,
  generateApiKey,
} from "./api-keys.server";

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://kaupet.no/api/v1/listings", { headers });
}

beforeEach(() => {
  rpcMock.mockClear();
  rpcSingleMock.mockReset();
});

describe("generateApiKey", () => {
  it("produces a prefixed key with a matching sha-256 hash", async () => {
    const { plaintext, prefix, hash } = await generateApiKey();

    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(prefix).toBe(plaintext.slice(0, 12));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
    const expectedHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(hash).toBe(expectedHash);
  });

  it("never generates the same key twice", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
  });
});

describe("authenticateApiKey", () => {
  it("rejects a missing Authorization header", async () => {
    await expect(authenticateApiKey(requestWithAuth(null))).rejects.toMatchObject({
      status: 401,
      code: "missing_key",
    });
  });

  it("rejects a non-Bearer Authorization header", async () => {
    await expect(authenticateApiKey(requestWithAuth("Basic abc123"))).rejects.toMatchObject({
      status: 401,
      code: "missing_key",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", 401, "invalid_key"],
    ["revoked", 401, "revoked"],
    ["expired", 401, "expired"],
    ["inactive_member", 403, "inactive_member"],
    ["no_proff", 403, "no_proff"],
  ] as const)("maps reason '%s' to HTTP %i / %s", async (reason, status, code) => {
    rpcSingleMock.mockResolvedValue({
      data: {
        reason,
        key_id: null,
        organization_id: null,
        acting_user_id: null,
        default_location_id: null,
        scopes: null,
      },
      error: null,
    });

    await expect(authenticateApiKey(requestWithAuth("Bearer kpt_live_abc"))).rejects.toMatchObject({
      status,
      code,
    });
  });

  it("returns the authenticated actor for a valid key", async () => {
    rpcSingleMock.mockResolvedValue({
      data: {
        reason: "ok",
        key_id: "key-1",
        organization_id: "org-1",
        acting_user_id: "user-1",
        default_location_id: "loc-1",
        scopes: ["listings:read"],
      },
      error: null,
    });

    const result = await authenticateApiKey(requestWithAuth("Bearer kpt_live_abc"));
    expect(result).toEqual({
      keyId: "key-1",
      organizationId: "org-1",
      actingUserId: "user-1",
      defaultLocationId: "loc-1",
      scopes: ["listings:read"],
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "resolve_organization_api_key",
      expect.objectContaining({ _key_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
  });

  it("propagates unexpected database errors as-is", async () => {
    const dbError = new Error("connection lost");
    rpcSingleMock.mockResolvedValue({ data: null, error: dbError });

    await expect(authenticateApiKey(requestWithAuth("Bearer kpt_live_abc"))).rejects.toBe(dbError);
  });

  it("ApiAuthError carries status/code/message", () => {
    const error = new ApiAuthError(429, "invalid_key" as never, "test");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(429);
  });
});
