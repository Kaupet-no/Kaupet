import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile.server";

const saved: Record<string, string | undefined> = {};
const savedFetch = globalThis.fetch;

beforeEach(() => {
  saved.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
  saved.TURNSTILE_ALLOWED_HOSTNAMES = process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  saved.NODE_ENV = process.env.NODE_ENV;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
});

afterEach(() => {
  if (saved.TURNSTILE_SECRET_KEY === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = saved.TURNSTILE_SECRET_KEY;
  if (saved.TURNSTILE_ALLOWED_HOSTNAMES === undefined)
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  else process.env.TURNSTILE_ALLOWED_HOSTNAMES = saved.TURNSTILE_ALLOWED_HOSTNAMES;
  process.env.NODE_ENV = saved.NODE_ENV;
  globalThis.fetch = savedFetch;
});

describe("verifyTurnstileToken", () => {
  it("fails closed when the secret is missing in production", async () => {
    process.env.NODE_ENV = "production";
    await expect(verifyTurnstileToken("some-token")).rejects.toThrow();
  });

  it("does not throw when the secret is missing outside production (local dev)", async () => {
    process.env.NODE_ENV = "development";
    await expect(verifyTurnstileToken(undefined)).resolves.toBeUndefined();
  });

  it("rejects a successful token with the wrong action or hostname", async () => {
    process.env.NODE_ENV = "production";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = "kaupet.no";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "other", hostname: "evil.example" }), {
        status: 200,
      }),
    );
    await expect(verifyTurnstileToken("token")).rejects.toThrow("Turnstile");
  });

  it("accepts a successful token for the configured action and hostname", async () => {
    process.env.NODE_ENV = "production";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = "kaupet.no";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "kaupet", hostname: "kaupet.no" }), {
        status: 200,
      }),
    );
    await expect(verifyTurnstileToken("token")).resolves.toBeUndefined();
  });
});
