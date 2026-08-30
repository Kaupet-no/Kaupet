// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logProductEvent } = vi.hoisted(() => ({
  logProductEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/product-analytics.functions", () => ({ logProductEvent }));
vi.mock("@/lib/native", () => ({ isNative: () => false, nativePlatform: () => "web" }));

import { getProductPlatform, trackProductEvent } from "./product-analytics";

describe("product analytics", () => {
  beforeEach(() => {
    logProductEvent.mockClear();
  });

  it("reports web as platform outside Capacitor", () => {
    expect(getProductPlatform()).toBe("web");
  });

  it("sender en tillatt hendelse uten klientidentifikator eller fritekst", async () => {
    trackProductEvent("search_submitted", { resultCount: 4, hasCategory: true });
    await vi.waitFor(() => expect(logProductEvent).toHaveBeenCalledOnce());
    expect(logProductEvent).toHaveBeenCalledWith({
      data: {
        eventName: "search_submitted",
        platform: "web",
        path: "/",
        properties: { resultCount: 4, hasCategory: true },
      },
    });
  });

  it("does not break the user action when telemetry throws synchronously", () => {
    logProductEvent.mockImplementationOnce(() => {
      throw new TypeError("Illegal invocation");
    });

    expect(() => trackProductEvent("onboarding_completed")).not.toThrow();
  });
});
