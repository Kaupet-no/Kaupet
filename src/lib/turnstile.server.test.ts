import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyTurnstileToken } from "./turnstile.server";

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
  saved.NODE_ENV = process.env.NODE_ENV;
  delete process.env.TURNSTILE_SECRET_KEY;
});

afterEach(() => {
  if (saved.TURNSTILE_SECRET_KEY === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = saved.TURNSTILE_SECRET_KEY;
  process.env.NODE_ENV = saved.NODE_ENV;
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
});
