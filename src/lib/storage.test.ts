import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrlsMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (...args: unknown[]) => createSignedUrlsMock(...args),
      }),
    },
  },
}));

import { signListingImageUrls } from "./storage";

beforeEach(() => {
  createSignedUrlsMock.mockReset();
});

describe("signListingImageUrls", () => {
  it("batches concurrent calls made within the same tick into one createSignedUrls request", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: "a.jpg", signedUrl: "https://example.com/a.jpg" },
        { path: "b.jpg", signedUrl: "https://example.com/b.jpg" },
      ],
      error: null,
    });

    const [resultA, resultB] = await Promise.all([
      signListingImageUrls(["a.jpg"]),
      signListingImageUrls(["b.jpg"]),
    ]);

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlsMock).toHaveBeenCalledWith(
      expect.arrayContaining(["a.jpg", "b.jpg"]),
      expect.any(Number),
    );
    expect(resultA).toEqual({ "a.jpg": "https://example.com/a.jpg" });
    expect(resultB).toEqual({ "b.jpg": "https://example.com/b.jpg" });
  });

  it("reuses the in-memory cache instead of re-fetching an already-signed path", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: "c.jpg", signedUrl: "https://example.com/c.jpg" }],
      error: null,
    });

    await signListingImageUrls(["c.jpg"]);
    createSignedUrlsMock.mockClear();
    const result = await signListingImageUrls(["c.jpg"]);

    expect(createSignedUrlsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ "c.jpg": "https://example.com/c.jpg" });
  });
});
