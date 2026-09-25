import { describe, expect, it } from "vitest";
import { containsImageMetadata } from "./image-metadata";

// Minimal JPEG byte sequences — enough to exercise the marker search without
// needing a real, fully-formed JPEG file.
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

function bytes(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

describe("containsImageMetadata", () => {
  it("detects a JPEG APP1 Exif segment", () => {
    // FF E1 <len> "Exif\0\0" <payload>
    const app1 = [0xff, 0xe1, 0x00, 0x08, ...ascii("Exif"), 0x00, 0x00];
    const jpeg = bytes(SOI, app1, EOI);

    expect(containsImageMetadata(jpeg)).toBe(true);
  });

  it("returns false for a JPEG with no APP1/XMP markers", () => {
    const jpeg = bytes(SOI, [0xff, 0xdb, 0x00, 0x03, 0x00, ...ascii("data")], EOI);

    expect(containsImageMetadata(jpeg)).toBe(false);
  });
});
