// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useListingCardGallery } from "./use-listing-card-gallery";

const gallery = vi.hoisted(() => ({ use: vi.fn() }));
vi.mock("@/hooks/use-listing-gallery-images", () => ({
  useListingGalleryImages: (...args: unknown[]) => gallery.use(...args),
}));
vi.mock("@/lib/storage", () => ({
  signListingImageUrls: (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `original:${path}`])),
}));

let intersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
class ObserverStub {
  constructor(callback: typeof intersect) {
    intersect = callback;
  }
  observe() {}
  disconnect() {}
}

function GalleryProbe() {
  const { rootRef, effectiveImageUrl, handleImageError } = useListingCardGallery(
    "listing-1",
    "cover.jpg",
    "thumbnail.jpg",
  );
  return (
    <article ref={rootRef}>
      <span>{effectiveImageUrl}</span>
      <button onClick={handleImageError}>Bildet feiler</button>
    </article>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  gallery.use.mockReset();
  intersect = undefined;
});

describe("useListingCardGallery", () => {
  it("laster galleriet nær kortet og faller tilbake til originalbildet", async () => {
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    gallery.use.mockImplementation((_listingId: string, enabled: boolean) => ({
      images: [],
      imgUrls: {},
      isLoading: enabled,
    }));

    render(<GalleryProbe />);
    expect(gallery.use).toHaveBeenLastCalledWith("listing-1", false);

    await act(async () => intersect?.([{ isIntersecting: true }]));
    await waitFor(() => expect(gallery.use).toHaveBeenLastCalledWith("listing-1", true));

    fireEvent.click(screen.getByRole("button", { name: "Bildet feiler" }));
    expect(screen.getByText("original:cover.jpg")).toBeTruthy();
  });
});
