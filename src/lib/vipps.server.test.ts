import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertVippsConfigured, getVippsMode } from "./vipps.server";

const VIPPS_KEYS = [
  "VIPPS_ENVIRONMENT",
  "VIPPS_CLIENT_ID",
  "VIPPS_CLIENT_SECRET",
  "VIPPS_SUBSCRIPTION_KEY",
  "VIPPS_MSN",
  "VIPPS_TEST_CLIENT_ID",
  "VIPPS_TEST_CLIENT_SECRET",
  "VIPPS_TEST_SUBSCRIPTION_KEY",
  "VIPPS_TEST_MSN",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of VIPPS_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of VIPPS_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("getVippsMode", () => {
  it("uses test mode for the test host", () => {
    expect(getVippsMode("test.kaupet.no")).toBe("test");
  });

  it("uses production mode for the production host", () => {
    expect(getVippsMode("kaupet.no")).toBe("production");
  });

  it("VIPPS_ENVIRONMENT override wins over host", () => {
    process.env.VIPPS_ENVIRONMENT = "test";
    expect(getVippsMode("kaupet.no")).toBe("test");

    process.env.VIPPS_ENVIRONMENT = "production";
    expect(getVippsMode("test.kaupet.no")).toBe("production");
  });
});

describe("assertVippsConfigured", () => {
  it("throws with the missing test-prefixed keys when on a test host", () => {
    expect(() => assertVippsConfigured("test.kaupet.no")).toThrow(/VIPPS_TEST_CLIENT_ID/);
  });

  it("throws with the missing production-prefixed keys when on the production host", () => {
    expect(() => assertVippsConfigured("kaupet.no")).toThrow(/VIPPS_CLIENT_ID/);
  });

  it("does not throw once all required keys are set", () => {
    process.env.VIPPS_CLIENT_ID = "id";
    process.env.VIPPS_CLIENT_SECRET = "secret";
    process.env.VIPPS_SUBSCRIPTION_KEY = "key";
    process.env.VIPPS_MSN = "123456";
    expect(() => assertVippsConfigured("kaupet.no")).not.toThrow();
  });
});
