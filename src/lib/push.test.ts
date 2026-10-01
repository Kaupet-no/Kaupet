import { afterEach, describe, expect, it, vi } from "vitest";
import { capturedUserAgent } from "./push";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function mockNavigator(userAgent: string, maxTouchPoints: number) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

describe("capturedUserAgent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("patcher iPadOS' desktop-UA (Macintosh + touch) til å lese iPad", () => {
    mockNavigator(MAC_UA, 5);
    expect(capturedUserAgent()).toContain("iPad");
    expect(capturedUserAgent()).not.toContain("Macintosh");
  });

  it("lar en ekte Mac (ingen touch) stå urørt", () => {
    mockNavigator(MAC_UA, 0);
    expect(capturedUserAgent()).toBe(MAC_UA);
  });
});

describe("VAPID_PUBLIC_KEY miljøseparasjon", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bruker staging-byggvariabelen når den er satt", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "staging-public-key");
    vi.resetModules();
    expect((await import("./push")).VAPID_PUBLIC_KEY).toBe("staging-public-key");
  });

  it("beholder eksisterende nøkkel uten byggvariabel", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
    vi.resetModules();
    expect((await import("./push")).VAPID_PUBLIC_KEY).toBe(
      "BPFo1ygL7dxhxhtTCPbE6b4qYkP9webql5QNaJuCReVeko8mzNCVyFunhDwIV95v4lKjHttAFgjxTN1zvsVvJnc",
    );
  });
});
