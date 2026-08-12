import { describe, expect, it } from "vitest";

import {
  hasValid360MagicBytes,
  MAX_360_BASE64_CHARS,
  MAX_360_FRAME_BYTES,
} from "./vehicle-360.functions";

describe("vehicle 360 upload validation", () => {
  it("keeps the encoded payload ceiling aligned with the decoded byte ceiling", () => {
    expect(MAX_360_BASE64_CHARS).toBe(Math.ceil(MAX_360_FRAME_BYTES / 3) * 4);
  });

  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts valid %s signatures", (mime, bytes) => {
    expect(hasValid360MagicBytes(Uint8Array.from(bytes), mime)).toBe(true);
  });

  it("rejects spoofed and truncated image signatures", () => {
    expect(hasValid360MagicBytes(Uint8Array.from([0xff, 0xd8]), "image/jpeg")).toBe(false);
    expect(hasValid360MagicBytes(Uint8Array.from([0x89, 0x50, 0x4e]), "image/png")).toBe(false);
    expect(hasValid360MagicBytes(new TextEncoder().encode("RIFFxxxxNOPE"), "image/webp")).toBe(
      false,
    );
  });
});
