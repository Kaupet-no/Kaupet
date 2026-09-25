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
    trackProductEvent("listing_publish_failed", { kind: "sell", step: "review" });
    await vi.waitFor(() => expect(logProductEvent).toHaveBeenCalledOnce());
    expect(logProductEvent).toHaveBeenCalledWith({
      data: {
        eventName: "listing_publish_failed",
        platform: "web",
        path: "/",
        properties: { kind: "sell", step: "review" },
      },
    });
  });

  it("does not break the user action when telemetry throws synchronously", () => {
    logProductEvent.mockImplementationOnce(() => {
      throw new TypeError("Illegal invocation");
    });

    expect(() => trackProductEvent("listing_publish_failed")).not.toThrow();
  });
});
