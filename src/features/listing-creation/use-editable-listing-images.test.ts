// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditableListingImages } from "./use-editable-listing-images";

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
}));

const validateImagesMock = vi.fn();
const describeImageErrorMock = vi.fn((...args: unknown[]) => `described:${args[0]}`);
const signListingImageUrlsMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  validateImages: (...args: unknown[]) => validateImagesMock(...args),
  describeImageError: (...args: unknown[]) => describeImageErrorMock(...args),
  signListingImageUrls: (...args: unknown[]) => signListingImageUrlsMock(...args),
}));
vi.mock("@/lib/image-compression", () => ({
  compressImage: (file: File) => Promise.resolve(file),
}));

beforeEach(() => {
  validateImagesMock.mockReset().mockReturnValue(null);
  describeImageErrorMock.mockClear();
  signListingImageUrlsMock.mockReset().mockResolvedValue({});
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

const listing = {
  id: "listing-1",
  listing_images: [
    { id: "img-2", storage_path: "path/2.jpg", sort_order: 2 },
    { id: "img-1", storage_path: "path/1.jpg", sort_order: 1 },
  ],
};

describe("useEditableListingImages", () => {
  it("hydrates existing images sorted by sort_order and signs their URLs", async () => {
    signListingImageUrlsMock.mockResolvedValue({
      "path/1.jpg": "https://signed/1",
      "path/2.jpg": "https://signed/2",
    });
    const { result } = renderHook(() => useEditableListingImages(listing));

    expect(result.current.items.map((i) => i.key)).toEqual(["path/1.jpg", "path/2.jpg"]);
    expect(result.current.imagesDirty).toBe(false);

    await waitFor(() => {
      const first = result.current.items[0];
      expect(first.kind === "existing" && first.url).toBe("https://signed/1");
    });
  });

  it("does not re-hydrate when the same listing id renders again", async () => {
    const { rerender } = renderHook(({ l }) => useEditableListingImages(l), {
      initialProps: { l: listing },
    });
    await waitFor(() => expect(signListingImageUrlsMock).toHaveBeenCalledTimes(1));

    rerender({ l: { ...listing } });

    expect(signListingImageUrlsMock).toHaveBeenCalledTimes(1);
  });

  it("addFiles appends valid files as new items and marks the set dirty", async () => {
    const { result } = renderHook(() => useEditableListingImages(listing));
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

    await act(() => result.current.addFiles([file]));

    expect(result.current.items).toHaveLength(3);
    const added = result.current.items[2];
    expect(added.kind).toBe("new");
    expect(result.current.imagesDirty).toBe(true);
  });

  it("addFiles shows an error toast and adds nothing when validation fails", async () => {
    const { showErrorToast } = await import("@/lib/toast");
    validateImagesMock.mockReturnValue("too_many");
    const { result } = renderHook(() => useEditableListingImages(listing));
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

    await act(() => result.current.addFiles([file]));

    expect(result.current.items).toHaveLength(2);
    expect(describeImageErrorMock).toHaveBeenCalledWith("too_many");
    expect(showErrorToast).toHaveBeenCalledWith("described:too_many");
  });

  it("removeItem on an existing image records its storage path as removed", () => {
    const { result } = renderHook(() => useEditableListingImages(listing));

    act(() => result.current.removeItem("path/1.jpg"));

    expect(result.current.items.map((i) => i.key)).toEqual(["path/2.jpg"]);
    expect(result.current.removedPaths).toEqual(["path/1.jpg"]);
    expect(result.current.imagesDirty).toBe(true);
  });

  it("removeItem on a newly added image revokes its object URL instead of tracking it as removed", async () => {
    const { result } = renderHook(() => useEditableListingImages(listing));
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await act(() => result.current.addFiles([file]));
    const newKey = result.current.items[2].key;

    act(() => result.current.removeItem(newKey));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.removedPaths).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("move reorders items and leaves the order unchanged at the boundaries", () => {
    const { result } = renderHook(() => useEditableListingImages(listing));

    act(() => result.current.move("path/2.jpg", -1));
    expect(result.current.items.map((i) => i.key)).toEqual(["path/2.jpg", "path/1.jpg"]);

    act(() => result.current.move("path/2.jpg", -1));
    expect(result.current.items.map((i) => i.key)).toEqual(["path/2.jpg", "path/1.jpg"]);
  });
});
