// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useListingCardImages } from "./use-listing-card-images";

const { signMock } = vi.hoisted(() => ({ signMock: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  thumbPathFor: (path: string) => `thumbs/${path}`,
  signListingImageUrls: (...args: unknown[]) => signMock(...args),
}));

const base = {
  kaupet_code: "12345678",
  title: "Test",
  price_nok: 100,
  is_free: false,
  city: "Oslo",
  created_at: "2026-01-01",
};

describe("useListingCardImages", () => {
  it("batches thumbnails and only falls back for missing legacy thumbs", async () => {
    signMock
      .mockResolvedValueOnce({ "thumbs/a.jpg": "signed-thumb-a" })
      .mockResolvedValueOnce({ "b.jpg": "signed-original-b" });
    const cards = [
      { ...base, id: "a", cover_path: "a.jpg" },
      { ...base, id: "b", cover_path: "b.jpg" },
    ];

    const { result } = renderHook(() => useListingCardImages(cards));
    await waitFor(() => expect(result.current.b).toBe("signed-original-b"));

    expect(signMock).toHaveBeenCalledTimes(2);
    expect(signMock).toHaveBeenNthCalledWith(1, ["thumbs/a.jpg", "thumbs/b.jpg"]);
    expect(signMock).toHaveBeenNthCalledWith(2, ["b.jpg"]);
    expect(result.current.a).toBe("signed-thumb-a");
  });
});
