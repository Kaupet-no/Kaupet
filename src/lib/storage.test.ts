import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({}) } },
}));

import { signListingImageUrls, signVehicle360FrameUrls } from "./storage";

describe("signListingImageUrls / signVehicle360FrameUrls", () => {
  const originalBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_BASE_URL = "https://bilder.kaupet.no";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_BASE_URL = originalBaseUrl;
  });

  it("bygger offentlige URL-er synkront for hver sti, uten noe nettverkskall", () => {
    const result = signListingImageUrls(["a.jpg", "b.jpg"]);
    expect(result).toEqual({
      "a.jpg": "https://bilder.kaupet.no/a.jpg",
      "b.jpg": "https://bilder.kaupet.no/b.jpg",
    });
  });

  it("gjør det samme for 360-bilder", () => {
    const result = signVehicle360FrameUrls(["frames/1.jpg"]);
    expect(result).toEqual({ "frames/1.jpg": "https://bilder.kaupet.no/frames/1.jpg" });
  });
});
