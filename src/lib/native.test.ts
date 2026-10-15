// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  getPhoto: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: mocks.getPlatform } }));
vi.mock("@capacitor/camera", () => ({
  Camera: { getPhoto: mocks.getPhoto },
  CameraResultType: { Uri: "uri" },
  CameraSource: { Camera: "CAMERA" },
}));

import { takeNativePhoto } from "./native";

describe("takeNativePhoto", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPlatform.mockReturnValue("ios");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["image"], { type: "image/jpeg" }),
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tar ett bilde med kameraet og gjør det om til en fil", async () => {
    mocks.getPhoto.mockResolvedValue({ webPath: "/camera", format: "jpeg" });
    const file = await takeNativePhoto();
    expect(mocks.getPhoto).toHaveBeenCalledWith({
      quality: 85,
      allowEditing: false,
      resultType: "uri",
      source: "CAMERA",
    });
    expect(fetch).toHaveBeenCalledWith("/camera");
    expect(file?.type).toBe("image/jpeg");
    expect(file?.name).toMatch(/\.jpg$/);
  });

  it("kaller ikke native-plugin i nettleser", async () => {
    mocks.getPlatform.mockReturnValue("web");
    expect(await takeNativePhoto()).toBeNull();
    expect(mocks.getPhoto).not.toHaveBeenCalled();
  });

  it("returnerer null ved avbrytelse", async () => {
    mocks.getPhoto.mockRejectedValue(new Error("User cancelled photos app"));
    expect(await takeNativePhoto()).toBeNull();
  });

  it("sender tillatelsesfeil videre", async () => {
    mocks.getPhoto.mockRejectedValue(new Error("Permission denied"));
    await expect(takeNativePhoto()).rejects.toThrow("Permission denied");
  });

  it("avviser bilder som ikke kan leses", async () => {
    mocks.getPhoto.mockResolvedValue({ webPath: "/missing", format: "jpeg" });
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(takeNativePhoto()).rejects.toThrow("Kunne ikke lese bildet");
  });
});
