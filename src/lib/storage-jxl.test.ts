import { describe, expect, it } from "vitest";

import { ALLOWED_MIME, IMAGE_ACCEPT, extFromMime, validateImages } from "./storage";

describe("bildeformatkontrakten", () => {
  it("godtar JPEG XL på samme måte som de øvrige bildeformatene", () => {
    const file = new File([new Uint8Array([1])], "bilde.jxl", { type: "image/jxl" });

    expect(ALLOWED_MIME).toContain("image/jxl");
    expect(IMAGE_ACCEPT).toContain("image/jxl");
    expect(IMAGE_ACCEPT).toContain(".jxl");
    expect(validateImages([file])).toBeNull();
    expect(extFromMime(file.type)).toBe("jxl");
  });

  it("avviser fortsatt ukjente bildeformater", () => {
    const file = new File([new Uint8Array([1])], "bilde.gif", { type: "image/gif" });

    expect(validateImages([file])).toMatchObject({ kind: "bad-type", name: "bilde.gif" });
  });
});
