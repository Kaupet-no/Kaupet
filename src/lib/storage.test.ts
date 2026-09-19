import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({}) } },
}));

const signMessageAttachmentUrlsFnMock = vi.fn();
vi.mock("@/lib/storage.functions", () => ({
  signMessageAttachmentUrls: (...args: unknown[]) => signMessageAttachmentUrlsFnMock(...args),
}));

import {
  MAX_ATTACHMENT_PATHS_PER_REQUEST,
  signListingImageUrls,
  signMessageAttachmentUrls,
  signVehicle360FrameUrls,
} from "./storage";

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

describe("signMessageAttachmentUrls", () => {
  beforeEach(() => {
    signMessageAttachmentUrlsFnMock.mockReset();
  });

  it("deler opp over MAX_ATTACHMENT_PATHS_PER_REQUEST stier i flere kall til serverfunksjonen", async () => {
    const pathCount = MAX_ATTACHMENT_PATHS_PER_REQUEST + 5;
    const paths = Array.from(
      { length: pathCount },
      (_, i) => `conv/${String(i).padStart(4, "0")}.jpg`,
    );

    signMessageAttachmentUrlsFnMock.mockImplementation(({ data }: { data: { paths: string[] } }) =>
      Promise.resolve(Object.fromEntries(data.paths.map((p) => [p, `https://signert/${p}`]))),
    );

    const result = await signMessageAttachmentUrls(paths);

    expect(signMessageAttachmentUrlsFnMock).toHaveBeenCalledTimes(2);
    for (const path of paths) {
      expect(result[path]).toBe(`https://signert/${path}`);
    }
  });
});
