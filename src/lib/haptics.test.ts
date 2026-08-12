import { beforeEach, describe, expect, it, vi } from "vitest";
import { hapticImpact, hapticNotification, hapticSelection } from "./haptics";

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  impact: vi.fn(),
}));

vi.mock("./native", () => ({ isNative: mocks.isNative }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: mocks.impact },
  ImpactStyle: { Light: "LIGHT" },
}));

describe("haptics", () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    mocks.impact.mockClear();
  });

  it("normalizes every semantic feedback type to one light touch", async () => {
    await hapticImpact("heavy");
    await hapticSelection();
    await hapticNotification("error");

    expect(mocks.impact).toHaveBeenCalledTimes(3);
    expect(mocks.impact.mock.calls).toEqual([
      [{ style: "LIGHT" }],
      [{ style: "LIGHT" }],
      [{ style: "LIGHT" }],
    ]);
  });

  it("does nothing outside the native app", async () => {
    mocks.isNative.mockReturnValue(false);
    await hapticImpact();
    expect(mocks.impact).not.toHaveBeenCalled();
  });
});
