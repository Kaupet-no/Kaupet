import { describe, expect, it, vi } from "vitest";

const imageCompression = vi.hoisted(() => vi.fn());
vi.mock("browser-image-compression", () => ({ default: imageCompression }));

import { compressImage } from "@/lib/image-compression";

describe("compressImage", () => {
  it("beholder originalen for opplasting når komprimert fil blir større", async () => {
    const original = new File(["x"], "bilde.jpg", { type: "image/jpeg" });
    imageCompression.mockResolvedValueOnce(new Blob(["større fil"]));
    expect(await compressImage(original, "listing")).toBe(original);
  });

  it("bruker alltid re-enkodet fil for KI-miniatyrer, også når den er større", async () => {
    const original = new File(["x"], "bilde.jpg", { type: "image/jpeg" });
    imageCompression.mockResolvedValueOnce(new Blob(["større fil"]));
    const result = await compressImage(original, "ai-identify");
    expect(result).not.toBe(original);
    expect(result.type).toBe("image/jpeg");
    expect(imageCompression).toHaveBeenLastCalledWith(
      original,
      expect.objectContaining({ maxWidthOrHeight: 480, preserveExif: false }),
    );
  });
});
