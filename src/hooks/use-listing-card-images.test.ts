// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
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
  it("builds thumbnail URLs for every card with a cover path in one call", () => {
    signMock.mockReturnValue({
      "thumbs/a.jpg": "public-thumb-a",
      "thumbs/b.jpg": "public-thumb-b",
    });
    const cards = [
      { ...base, id: "a", cover_path: "a.jpg" },
      { ...base, id: "b", cover_path: "b.jpg" },
    ];

    const { result } = renderHook(() => useListingCardImages(cards));

    expect(signMock).toHaveBeenCalledTimes(1);
    expect(signMock).toHaveBeenCalledWith(["thumbs/a.jpg", "thumbs/b.jpg"]);
    expect(result.current.a).toBe("public-thumb-a");
    expect(result.current.b).toBe("public-thumb-b");
  });

  it("skips cards without a cover path", () => {
    signMock.mockReturnValue({});
    const cards = [{ ...base, id: "a", cover_path: null }];

    const { result } = renderHook(() => useListingCardImages(cards));

    expect(signMock).toHaveBeenCalledWith([]);
    expect(result.current).toEqual({});
  });
});
