// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createListing,
  getUser,
  showErrorToast,
  upsertImages,
  uploadImage,
  uploadThumb,
  listImages,
  deleteImages,
  updateImage,
  deleteStoredImage,
  preparePublish,
  deleteImageRows,
} = vi.hoisted(() => ({
  deleteImageRows: vi.fn(),
  preparePublish: vi.fn(),
  createListing: vi.fn(),
  getUser: vi.fn(),
  showErrorToast: vi.fn(),
  upsertImages: vi.fn(),
  uploadImage: vi.fn(),
  uploadThumb: vi.fn(),
  listImages: vi.fn(),
  deleteImages: vi.fn(),
  updateImage: vi.fn(),
  deleteStoredImage: vi.fn(async () => {}),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({
      upsert: upsertImages,
      select: () => ({ eq: listImages }),
      delete: () => {
        deleteImageRows();
        return {
          eq: () =>
            Object.assign(Promise.resolve({ error: null }), {
              in: deleteImages,
              select: async () => ({ data: [], error: null }),
            }),
        };
      },
      update: (fields: unknown) => ({
        eq: (_column: string, id: string) => updateImage(fields, id),
      }),
    }),
  },
}));
vi.mock("@/lib/listings.functions", () => ({ createListing }));
vi.mock("@/lib/storage", () => ({
  uploadListingImage: uploadImage,
  uploadListingImageThumb: uploadThumb,
  deleteListingImage: deleteStoredImage,
}));
vi.mock("@/lib/geocode", () => ({ geocodeNorwayAddress: vi.fn(async () => null) }));
vi.mock("@/lib/toast", () => ({ showErrorToast }));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ hapticNotification: vi.fn() }));

import type { CategoryBehavior } from "@/lib/category-behavior";

import { usePublishListing, usePublishState } from "./use-publish-listing";

const values = {
  title: "Sykkel i god stand",
  description: "En fin sykkel som er lite brukt og godt vedlikeholdt.",
  category_id: "cat-1",
  is_free: false,
  price_nok: 1500,
};

function setup(images: import("@/components/image-uploader").PendingImage[] = []) {
  const clearDraftStorage = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    clearDraftStorage,
    ...renderHook(
      () => {
        const state = usePublishState();
        const publish = usePublishListing({
          state,
          images,
          attributes: {},
          coords: { lat: 59.9, lng: 10.7 },
          draftId: "draft-1",
          ownerId: "u1",
          ownerOrganizationId: null,
          isCurrent: () => true,
          preparePublish,
          resumeAutosave: vi.fn(),
          clearDraftStorage,
          fieldGroupKeys: ["title"],
          behavior: { requiresDeliveryMethod: false } as CategoryBehavior,
          isVehicle: false,
          currentStepKey: "review-publish",
        });
        return { state, ...publish };
      },
      { wrapper },
    ),
  };
}

describe("usePublishListing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    preparePublish.mockResolvedValue({ id: "draft-1", published: false });
    uploadImage.mockImplementation(async ({ file }) => `draft-1/${file.name}`);
    uploadThumb.mockResolvedValue(undefined);
    upsertImages.mockResolvedValue({ error: null });
    listImages.mockResolvedValue({ data: [], error: null });
    deleteImages.mockResolvedValue({ error: null });
    updateImage.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("publiserer bare én gang selv om publishOnce kalles flere ganger", async () => {
    createListing.mockResolvedValue({ id: "l1", kaupet_code: "ABC123" });
    const { result, clearDraftStorage } = setup();

    act(() => {
      result.current.publishOnce(values);
      result.current.publishOnce(values);
    });

    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(createListing.mock.calls[0][0].data).toMatchObject({
      draftId: "draft-1",
      price_nok: 1500,
      lat: 59.9,
      can_ship: null,
    });
    expect(result.current.state.publishedId).toBe("l1");
    expect(result.current.state.publishedCode).toBe("ABC123");
    expect(clearDraftStorage).toHaveBeenCalledWith({ stopAutosave: true });
  });

  it("slipper låsen og viser feil når publiseringen feiler, slik at nytt forsøk er mulig", async () => {
    createListing.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();

    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(result.current.state.publishedId).toBeNull();
    expect(result.current.state.publishAttemptPendingRef.current).toBe(false);

    createListing.mockResolvedValue({ id: "l2", kaupet_code: null });
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedId).toBe("l2"));
  });
  it("beholder utkastet ved opplastingsfeil og gjenbruker vellykkede opplastinger", async () => {
    const images = pendingImages("a", "b");
    uploadImage.mockRejectedValueOnce(new Error("Nettbrudd"));
    createListing.mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const { result } = setup(images);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(createListing).not.toHaveBeenCalled();
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(createListing.mock.calls[0][0].data.images).toHaveLength(2);
    expect(uploadImage.mock.calls.filter(([arg]) => arg.file.name === "b.jpg")).toHaveLength(1);
    expect(upsertImages).not.toHaveBeenCalled();
  });

  it("gjenbruker bilde-ID og sti etter tapt publiseringssvar", async () => {
    createListing
      .mockRejectedValueOnce(new Error("Svaret gikk tapt"))
      .mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123", already_published: true });
    const { result } = setup(pendingImages("a"));
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(createListing.mock.calls[1][0].data.images).toEqual(
      createListing.mock.calls[0][0].data.images,
    );
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(showErrorToast).toHaveBeenLastCalledWith(expect.stringContaining("ikke lagret"));
  });

  it.each([false, true])(
    "stopper opplasting når forberedelsen bekrefter publisering (nye bilder: %s)",
    async (replace) => {
      const images = pendingImages("a");
      createListing.mockRejectedValueOnce(new Error("Svaret gikk tapt"));
      const { result, rerender } = setup(images);
      act(() => result.current.publishOnce(values));
      await waitFor(() => expect(result.current.mutation.isError).toBe(true));
      const uploads = uploadImage.mock.calls.length;
      images.splice(0, 1, ...(replace ? pendingImages("b") : []));
      rerender();
      preparePublish.mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123", published: true });
      act(() => result.current.publishOnce(values));
      await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
      expect(uploadImage).toHaveBeenCalledTimes(uploads);
      expect(createListing).toHaveBeenCalledTimes(1);
      expect(deleteImageRows).not.toHaveBeenCalled();
      expect(deleteStoredImage).not.toHaveBeenCalled();
    },
  );

  it("sender 100 bilder i samme publiseringskall", async () => {
    createListing.mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const { result } = setup(pendingImages(...Array.from({ length: 100 }, (_, i) => String(i))));
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(createListing.mock.calls[0][0].data.images).toHaveLength(100);
    expect(upsertImages).not.toHaveBeenCalled();
  });

  it("sender gjeldende bildeliste og bildetekst etter mislykket publisering", async () => {
    createListing
      .mockRejectedValueOnce(new Error("Publisering avvist"))
      .mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const images = pendingImages("a", "b");
    const { result, rerender } = setup(images);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    images.splice(0, 1);
    images[0].caption = "Ny bildetekst";
    rerender();
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(createListing.mock.calls[1][0].data.images).toEqual([
      expect.objectContaining({
        storage_path: "draft-1/b.jpg",
        sort_order: 0,
        caption: "Ny bildetekst",
      }),
    ]);
    // Registered, unreferenced files use the existing guarded cleanup job.
    expect(deleteStoredImage).not.toHaveBeenCalled();
  });

  it("lar serveren håndtere en publisering som skjedde mens opplastingen ventet", async () => {
    let release!: (path: string) => void;
    uploadImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    createListing.mockResolvedValue({
      id: "draft-1",
      kaupet_code: "ABC123",
      already_published: true,
    });
    const { result } = setup(pendingImages("a"));
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await act(async () => release("draft-1/a.jpg"));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(deleteImageRows).not.toHaveBeenCalled();
    expect(upsertImages).not.toHaveBeenCalled();
    expect(updateImage).not.toHaveBeenCalled();
    expect(deleteStoredImage).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalledWith(expect.stringContaining("ikke lagret"));
  });
});

function pendingImages(...ids: string[]): import("@/components/image-uploader").PendingImage[] {
  return ids.map((id) => ({
    id,
    file: new File([id], `${id}.jpg`),
    thumbFile: new File([id], `${id}-thumb.jpg`),
    previewUrl: "",
  }));
}
