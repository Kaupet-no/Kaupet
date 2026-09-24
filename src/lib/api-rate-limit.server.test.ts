import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
const supabaseAdmin = { rpc: rpcMock };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import { INTEGRATION_LIMITS } from "@/lib/integration-limits";
import {
  apiRateLimitHeaders,
  consumeApiRateLimit,
  peekApiRateLimit,
} from "./api-rate-limit.server";

beforeEach(() => {
  rpcMock.mockClear();
  rpcSingleMock.mockReset();
});

describe("consumeApiRateLimit", () => {
  it("uses the configured limit for the given kind and reports remaining/reset", async () => {
    const resetAt = new Date(Date.now() + 3_600_000).toISOString();
    rpcSingleMock.mockResolvedValue({
      data: {
        allowed: true,
        count: 1,
        limit: INTEGRATION_LIMITS.apiKey.readPerHour,
        reset_at: resetAt,
      },
      error: null,
    });

    const result = await consumeApiRateLimit("key-1", "read");

    expect(rpcMock).toHaveBeenCalledWith(
      "consume_rate_limit",
      expect.objectContaining({
        _bucket: "api-key:read",
        _limit: INTEGRATION_LIMITS.apiKey.readPerHour,
        _window_seconds: 3600,
      }),
    );
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(INTEGRATION_LIMITS.apiKey.readPerHour);
    expect(result.remaining).toBe(INTEGRATION_LIMITS.apiKey.readPerHour - 1);
  });

  it("reports allowed=false with a Retry-After once the limit is reached", async () => {
    const resetAt = new Date(Date.now() + 1_800_000).toISOString();
    rpcSingleMock.mockResolvedValue({
      data: {
        allowed: false,
        count: INTEGRATION_LIMITS.apiKey.writePerHour + 1,
        limit: INTEGRATION_LIMITS.apiKey.writePerHour,
        reset_at: resetAt,
      },
      error: null,
    });

    const result = await consumeApiRateLimit("key-1", "write");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);

    const headers = apiRateLimitHeaders(result);
    expect(headers["X-RateLimit-Limit"]).toBe(String(INTEGRATION_LIMITS.apiKey.writePerHour));
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("uses a distinct bucket per kind for the same key", async () => {
    rpcSingleMock.mockResolvedValue({
      data: { allowed: true, count: 1, limit: 10, reset_at: new Date().toISOString() },
      error: null,
    });
    await consumeApiRateLimit("key-1", "read");
    await consumeApiRateLimit("key-1", "batch");

    const [readCall, batchCall] = rpcMock.mock.calls as unknown as [
      [string, { _key_hash: string }],
      [string, { _key_hash: string }],
    ];
    expect(readCall[1]._key_hash).not.toBe(batchCall[1]._key_hash);
  });
});

describe("peekApiRateLimit", () => {
  it("does not affect allowed/headers derived from consume, only reads", async () => {
    rpcSingleMock.mockResolvedValue({
      data: {
        count: 2,
        limit: INTEGRATION_LIMITS.apiKey.batchPerHour,
        reset_at: new Date().toISOString(),
      },
      error: null,
    });
    const result = await peekApiRateLimit("key-1", "batch");
    expect(rpcMock).toHaveBeenCalledWith("peek_rate_limit", expect.anything());
    expect(result.remaining).toBe(INTEGRATION_LIMITS.apiKey.batchPerHour - 2);
  });
});

describe("apiRateLimitHeaders", () => {
  it("omits Retry-After when the call was allowed", () => {
    const headers = apiRateLimitHeaders({
      allowed: true,
      kind: "read",
      limit: 300,
      remaining: 299,
      resetAt: new Date(),
      retryAfterSeconds: 0,
    });
    expect(headers["Retry-After"]).toBeUndefined();
  });
});
