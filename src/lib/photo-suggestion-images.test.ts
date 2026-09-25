import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the underlying compression library, not compressImage itself, so the
// test also proves compressImage is wired up with the right preset options.
// vi.mock is hoisted above imports, so the mock fn must be created via
// vi.hoisted to be referenceable inside the factory.
const { imageCompressionMock } = vi.hoisted(() => ({
  imageCompressionMock: vi.fn(async (_file: File, options: Record<string, unknown>) => {
    // Return a tiny valid-looking JPEG File; content doesn't matter here, only
    // that preparePhotoSuggestionImages reads it back via arrayBuffer().
    return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "out.jpg", {
      type: options.fileType as string,
    });
  }),
}));

vi.mock("browser-image-compression", () => ({ default: imageCompressionMock }));

import { PHOTO_SUGGESTION_LIMITS, preparePhotoSuggestionImages } from "./photo-suggestion-images";

function makeFile(name: string): File {
  // Bigger than the mocked compressed output below, so compressImage's
  // "keep the smaller of original/compressed" fallback picks the compressed
  // (re-encoded) file rather than the untouched original.
  return new File([new Uint8Array(64).fill(9)], name, { type: "image/png" });
}

afterEach(() => {
  imageCompressionMock.mockClear();
});

describe("preparePhotoSuggestionImages", () => {
  it("caps identify at 2 images and uses the 480px preset without preserveExif", async () => {
    const files = [makeFile("a.png"), makeFile("b.png"), makeFile("c.png")];

    const result = await preparePhotoSuggestionImages(files, "identify");

    expect(imageCompressionMock).toHaveBeenCalledTimes(PHOTO_SUGGESTION_LIMITS.identify.maxImages);
    expect(imageCompressionMock.mock.calls[0][1]).toMatchObject({
      maxWidthOrHeight: PHOTO_SUGGESTION_LIMITS.identify.maxDimension,
      fileType: "image/jpeg",
      preserveExif: false,
    });
    expect(result).toHaveLength(2);
    expect(result[0].mime).toBe("image/jpeg");
    expect(result[0].dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("caps attributes at 3 images and uses the 768px preset", async () => {
    const files = [makeFile("a.png"), makeFile("b.png"), makeFile("c.png"), makeFile("d.png")];

    await preparePhotoSuggestionImages(files, "attributes");

    expect(imageCompressionMock).toHaveBeenCalledTimes(
      PHOTO_SUGGESTION_LIMITS.attributes.maxImages,
    );
    expect(imageCompressionMock.mock.calls[0][1]).toMatchObject({
      maxWidthOrHeight: PHOTO_SUGGESTION_LIMITS.attributes.maxDimension,
      preserveExif: false,
    });
  });

  it("drops a re-encoded image that still contains EXIF metadata", async () => {
    imageCompressionMock.mockResolvedValueOnce(
      new File(
        [
          new Uint8Array([
            0xff,
            0xe1,
            0x00,
            0x08,
            ...Array.from("Exif", (c) => c.charCodeAt(0)),
            0,
            0,
          ]),
        ],
        "out.jpg",
        { type: "image/jpeg" },
      ),
    );

    const result = await preparePhotoSuggestionImages([makeFile("a.png")], "identify");

    expect(result).toHaveLength(0);
  });
});
