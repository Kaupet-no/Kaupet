import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  uploadListingImage: vi.fn(),
  uploadListingImageThumb: vi.fn(),
}));
vi.mock("@/lib/storage", () => storage);

import type { PendingImage } from "@/components/image-uploader";
import {
  reusableRemote,
  uploadDraftImage,
  UPLOAD_REUSE_TTL_MS,
  type RemoteImage,
} from "./draft-image-sync";

const now = 1_000_000_000_000;
const withRemote = (remote: RemoteImage): PendingImage =>
  ({ id: "img", previewUrl: "", remote }) as unknown as PendingImage;

describe("reusableRemote", () => {
  it("gjenbruker en fersk opplasting til samme annonse", () => {
    const remote = { id: "r", path: "draft-1/a.webp", uploadedAt: now - 1 };
    expect(reusableRemote(withRemote(remote), "draft-1", now)).toBe(remote);
  });

  it("laster opp på nytt til en annen annonse", () => {
    const remote = { id: "r", path: "draft-1/a.webp", uploadedAt: now };
    expect(reusableRemote(withRemote(remote), "draft-2", now)).toBeNull();
  });

  it("laster opp på nytt når en ureferert fil kan være ryddet bort", () => {
    const remote = { id: "r", path: "draft-1/a.webp", uploadedAt: now - UPLOAD_REUSE_TTL_MS };
    expect(reusableRemote(withRemote(remote), "draft-1", now)).toBeNull();
  });

  it("gjenbruker en gammel fil som er knyttet til utkastet", () => {
    const remote = { id: "r", path: "draft-1/a.webp", uploadedAt: 0, synced: true };
    expect(reusableRemote(withRemote(remote), "draft-1", now)).toBe(remote);
  });
});

describe("uploadDraftImage", () => {
  const image = { file: new File(["a"], "a.jpg"), thumbFile: new File(["t"], "t.jpg") };

  it.each([
    { thumbFails: false, thumbMissing: undefined },
    { thumbFails: true, thumbMissing: true },
  ])("merker manglende miniatyr: $thumbFails", async ({ thumbFails, thumbMissing }) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    storage.uploadListingImage.mockResolvedValue("draft-1/a.webp");
    if (thumbFails) storage.uploadListingImageThumb.mockRejectedValue(new Error("nett"));
    else storage.uploadListingImageThumb.mockResolvedValue(undefined);
    const remote = await uploadDraftImage("draft-1", image as unknown as PendingImage);
    expect(remote.path).toBe("draft-1/a.webp");
    expect(remote.thumbMissing).toBe(thumbMissing);
  });
});
