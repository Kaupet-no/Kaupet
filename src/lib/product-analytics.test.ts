// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logProductEvent } = vi.hoisted(() => ({
  logProductEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/product-analytics.functions", () => ({ logProductEvent }));
vi.mock("@/lib/native", () => ({ isNative: () => false, nativePlatform: () => "web" }));

import { getProductPlatform, getProductSessionId, trackProductEvent } from "./product-analytics";

describe("product analytics", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    logProductEvent.mockClear();
  });

  it("reuses one anonymous id for the current session", () => {
    const first = getProductSessionId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getProductSessionId()).toBe(first);
  });

  it("reports web as platform outside Capacitor", () => {
    expect(getProductPlatform()).toBe("web");
  });

  it("sends an allowlisted event without user or free-text metadata", async () => {
    trackProductEvent("search_submitted", { resultCount: 4, hasCategory: true });
    await vi.waitFor(() => expect(logProductEvent).toHaveBeenCalledOnce());
    expect(logProductEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: "search_submitted",
        platform: "web",
        properties: { resultCount: 4, hasCategory: true },
      }),
    });
  });

  it("does not break the user action when telemetry throws synchronously", () => {
    logProductEvent.mockImplementationOnce(() => {
      throw new TypeError("Illegal invocation");
    });

    expect(() => trackProductEvent("onboarding_completed")).not.toThrow();
  });
});
