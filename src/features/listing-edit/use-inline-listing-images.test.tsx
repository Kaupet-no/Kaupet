// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(async (_row: { sort_order: number }) => ({ error: null })),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockImplementation((column: string) =>
    column === "listing_id" ? builder : Promise.resolve({ error: null }),
  );
  return {
    builder,
    from: vi.fn(() => builder),
    invalidateQueries: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("@/lib/image-compression", () => ({ compressImage: vi.fn(async (file: File) => file) }));
vi.mock("@/lib/storage", () => ({
  deleteListingImage: vi.fn(),
  describeImageError: vi.fn(),
  uploadListingImage: vi.fn(async ({ file }: { file: File }) => `listing-1/${file.name}`),
  uploadListingImageThumb: vi.fn(async () => undefined),
  validateImages: vi.fn(() => null),
  MAX_LISTING_IMAGES: 20,
}));

import { useInlineListingImages } from "./use-inline-listing-images";

const images = ["first.jpg", "second.jpg", "third.jpg"].map((storage_path, sort_order) => ({
  storage_path,
  sort_order,
}));

beforeEach(() => {
  mocks.builder.update.mockClear();
  mocks.builder.eq.mockClear();
  mocks.from.mockClear();
  mocks.invalidateQueries.mockClear();
});

describe("useInlineListingImages", () => {
  it("flytter bildet til slippmålet og lagrer den nye rekkefølgen", async () => {
    const { result } = renderHook(() =>
      useInlineListingImages({ listingId: "listing-1", images, imgUrls: {} }),
    );

    await act(async () => {
      await result.current.moveTo("first.jpg", "third.jpg");
    });

    expect(result.current.items.map((item) => item.storage_path)).toEqual([
      "second.jpg",
      "third.jpg",
      "first.jpg",
    ]);
    expect(mocks.builder.update).toHaveBeenCalledTimes(3);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["listing"] });
  });

  it("beholder rekkefølgen ved samme eller ukjent slippmål", async () => {
    const { result } = renderHook(() =>
      useInlineListingImages({ listingId: "listing-1", images, imgUrls: {} }),
    );

    await act(async () => {
      await result.current.moveTo("second.jpg", "second.jpg");
      await result.current.moveTo("second.jpg", "missing.jpg");
    });

    expect(result.current.items.map((item) => item.storage_path)).toEqual([
      "first.jpg",
      "second.jpg",
      "third.jpg",
    ]);
    expect(mocks.builder.update).not.toHaveBeenCalled();
  });

  it("beholder pilflytting som en ett-stegsvariant av samme reorder", async () => {
    const { result } = renderHook(() =>
      useInlineListingImages({ listingId: "listing-1", images, imgUrls: {} }),
    );

    await act(async () => {
      await result.current.move("third.jpg", -1);
    });

    expect(result.current.items.map((item) => item.storage_path)).toEqual([
      "first.jpg",
      "third.jpg",
      "second.jpg",
    ]);
  });

  // KG-22-F02: alle nye bilder i samme valg fikk samme sort_order.
  it("gir hvert nytt bilde et eget, stigende sorteringsnummer", async () => {
    const { result } = renderHook(() =>
      useInlineListingImages({ listingId: "listing-1", images, imgUrls: {} }),
    );
    const files = ["a.jpg", "b.jpg", "c.jpg"].map((name) => new File(["x"], name));
    await act(async () => {
      await result.current.addFiles(files);
    });
    expect(mocks.builder.insert.mock.calls.map(([row]) => row.sort_order)).toEqual([3, 4, 5]);
  });
});
