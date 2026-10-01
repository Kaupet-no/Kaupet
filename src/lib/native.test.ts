// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  pickImages: vi.fn(),
  getPhoto: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: mocks.getPlatform } }));
vi.mock("@capacitor/camera", () => ({
  Camera: { pickImages: mocks.pickImages, getPhoto: mocks.getPhoto },
  CameraResultType: { Uri: "uri" },
  CameraSource: { Camera: "CAMERA" },
}));

import { pickNativePhotos } from "./native";

describe("pickNativePhotos", () => {
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

  it.each([1, 2, 100])(
    "konverterer %i valgte bilder til filer i samme rekkefølge (grenseverdier)",
    async (count) => {
      mocks.pickImages.mockResolvedValue({
        photos: Array.from({ length: count }, (_, i) => ({
          webPath: `/photo-${i}`,
          format: "jpeg",
        })),
      });
      const files = await pickNativePhotos("gallery", count);
      expect(mocks.pickImages).toHaveBeenCalledWith({ quality: 85, limit: count });
      expect(mocks.getPhoto).not.toHaveBeenCalled();
      expect(files).toHaveLength(count);
      expect(new Set(files.map((file) => file.name)).size).toBe(count);
      for (const [i, file] of files.entries()) {
        expect(fetch).toHaveBeenNthCalledWith(i + 1, `/photo-${i}`);
        expect(file.type).toBe("image/jpeg");
        expect(file.name).toMatch(/\.jpg$/);
      }
    },
  );

  it("beholder enkeltbilde fra kamera", async () => {
    mocks.getPhoto.mockResolvedValue({ webPath: "/camera", format: "jpeg" });
    expect(await pickNativePhotos("camera", 20)).toHaveLength(1);
    expect(mocks.getPhoto).toHaveBeenCalledWith({
      quality: 85,
      allowEditing: false,
      resultType: "uri",
      source: "CAMERA",
    });
    expect(mocks.pickImages).not.toHaveBeenCalled();
  });

  it.each([0, -1])("åpner ikke bildevelgeren når kapasiteten er %i", async (limit) => {
    expect(await pickNativePhotos("gallery", limit)).toEqual([]);
    expect(mocks.pickImages).not.toHaveBeenCalled();
  });

  it("kaller ikke native-plugin i nettleser", async () => {
    mocks.getPlatform.mockReturnValue("web");
    expect(await pickNativePhotos("gallery", 20)).toEqual([]);
    expect(mocks.pickImages).not.toHaveBeenCalled();
  });

  it("returnerer tom liste ved tomt valg og avbrytelse", async () => {
    mocks.pickImages.mockResolvedValue({ photos: [] });
    expect(await pickNativePhotos("gallery", 20)).toEqual([]);
    mocks.pickImages.mockRejectedValue(new Error("User cancelled photos app"));
    expect(await pickNativePhotos("gallery", 20)).toEqual([]);
  });

  it("sender tillatelsesfeil videre", async () => {
    mocks.pickImages.mockRejectedValue(new Error("Permission denied"));
    await expect(pickNativePhotos("gallery", 20)).rejects.toThrow("Permission denied");
  });

  it("avviser bilder som ikke kan leses", async () => {
    mocks.pickImages.mockResolvedValue({ photos: [{ webPath: "/missing", format: "jpeg" }] });
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(pickNativePhotos("gallery", 20)).rejects.toThrow("Kunne ikke lese bildet");
  });
});
