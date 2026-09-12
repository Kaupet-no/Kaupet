import { beforeEach, describe, expect, it, vi } from "vitest";
import { hapticImpact, hapticNotification, hapticSelection } from "./haptics";

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  nativePlatform: vi.fn<() => "ios" | "android" | "web">(() => "ios"),
  impact: vi.fn(),
  softTap: vi.fn(),
}));

vi.mock("./native", () => ({
  isNative: mocks.isNative,
  nativePlatform: mocks.nativePlatform,
}));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: mocks.impact },
  ImpactStyle: { Light: "LIGHT" },
}));
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ tap: mocks.softTap }),
}));

describe("haptics", () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.nativePlatform.mockReturnValue("ios");
    mocks.impact.mockClear();
    mocks.softTap.mockClear();
    mocks.softTap.mockResolvedValue(undefined);
  });

  it("normalizes every semantic feedback type to one light touch on iOS", async () => {
    await hapticImpact("heavy");
    await hapticSelection();
    await hapticNotification("error");

    expect(mocks.impact).toHaveBeenCalledTimes(3);
    expect(mocks.impact.mock.calls).toEqual([
      [{ style: "LIGHT" }],
      [{ style: "LIGHT" }],
      [{ style: "LIGHT" }],
    ]);
    expect(mocks.softTap).not.toHaveBeenCalled();
  });

  it("does nothing outside the native app", async () => {
    mocks.isNative.mockReturnValue(false);
    await hapticImpact();
    expect(mocks.impact).not.toHaveBeenCalled();
    expect(mocks.softTap).not.toHaveBeenCalled();
  });

  it("uses the SoftHaptics bridge on Android instead of Haptics.impact", async () => {
    mocks.nativePlatform.mockReturnValue("android");
    await hapticImpact("light");

    expect(mocks.softTap).toHaveBeenCalledTimes(1);
    expect(mocks.impact).not.toHaveBeenCalled();
  });

  it("falls back to Haptics.impact when the Android bridge fails", async () => {
    mocks.nativePlatform.mockReturnValue("android");
    mocks.softTap.mockRejectedValue(new Error("plugin unavailable"));

    await hapticImpact("light");

    expect(mocks.softTap).toHaveBeenCalledTimes(1);
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    expect(mocks.impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });
});
