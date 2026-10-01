// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useListingImageFallback } from "./use-listing-image-fallback";

describe("useListingImageFallback", () => {
  it("går fra thumbnail til original, og gir opp når begge feiler", () => {
    const { result } = renderHook(() => useListingImageFallback("thumb.jpg", "orig.jpg"));
    expect(result.current.effectiveImageUrl).toBe("thumb.jpg");

    act(() => result.current.handleImageError());
    expect(result.current.effectiveImageUrl).toBe("orig.jpg");
    expect(result.current.imageFailed).toBe(false);

    act(() => result.current.handleImageError());
    expect(result.current.effectiveImageUrl).toBeNull();
    expect(result.current.imageFailed).toBe(true);
  });

  it("gir opp med en gang når det ikke finnes en egen fallback", () => {
    const { result } = renderHook(() => useListingImageFallback("orig.jpg", "orig.jpg"));
    act(() => result.current.handleImageError());
    expect(result.current.imageFailed).toBe(true);
  });
});
