/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";

const lock = vi.fn().mockResolvedValue(undefined);
const unlock = vi.fn().mockResolvedValue(undefined);

vi.mock("@capacitor/screen-orientation", () => ({
  ScreenOrientation: { lock, unlock },
}));

const isNative = vi.fn(() => true);
vi.mock("./native", () => ({ isNative: () => isNative() }));

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
}

async function freshModule() {
  vi.resetModules();
  return await import("./orientation");
}

describe("orientation", () => {
  beforeEach(() => {
    lock.mockClear();
    unlock.mockClear();
    isNative.mockReturnValue(true);
  });

  it("låser portrett på telefon", async () => {
    setViewport(375, 812);
    const m = await freshModule();
    await m.lockPortraitOnPhone();
    expect(lock).toHaveBeenCalledWith({ orientation: "portrait" });
  });

  it("låser ikke på nettbrett", async () => {
    setViewport(820, 1180);
    const m = await freshModule();
    await m.lockPortraitOnPhone();
    expect(lock).not.toHaveBeenCalled();
  });

  it("leser telefon i landskap som telefon (korteste side)", async () => {
    setViewport(844, 390);
    const m = await freshModule();
    await m.lockPortraitOnPhone();
    expect(lock).toHaveBeenCalled();
  });

  it("låser ikke opp når vi aldri låste", async () => {
    setViewport(820, 1180);
    const m = await freshModule();
    await m.unlockOrientation();
    expect(unlock).not.toHaveBeenCalled();
  });

  it("låser opp igjen etter en lås", async () => {
    setViewport(375, 812);
    const m = await freshModule();
    await m.lockPortraitOnPhone();
    await m.unlockOrientation();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("gjør ingenting på web", async () => {
    isNative.mockReturnValue(false);
    setViewport(375, 812);
    const m = await freshModule();
    await m.lockPortraitOnPhone();
    expect(lock).not.toHaveBeenCalled();
  });
});
