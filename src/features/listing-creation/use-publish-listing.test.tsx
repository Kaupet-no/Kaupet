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
} = vi.hoisted(() => ({
  createListing: vi.fn(),
  getUser: vi.fn(),
  showErrorToast: vi.fn(),
  upsertImages: vi.fn(),
  uploadImage: vi.fn(),
  uploadThumb: vi.fn(),
  listImages: vi.fn(),
  deleteImages: vi.fn(),
  updateImage: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({
      upsert: upsertImages,
      select: () => ({ eq: listImages }),
      delete: () => ({
        eq: () => Object.assign(Promise.resolve({ error: null }), { in: deleteImages }),
      }),
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
          preparePublish: async () => "draft-1",
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
  it("beholder annonsen som utkast ved bildefeil og fullfører neste forsøk", async () => {
    const images = ["a", "b"].map((id) => ({
      id,
      file: new File([id], `${id}.jpg`),
      thumbFile: new File([id], `${id}-thumb.jpg`),
      previewUrl: "",
    }));
    uploadImage.mockRejectedValueOnce(new Error("Nettbrudd"));
    createListing.mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const { result } = setup(images);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(createListing).not.toHaveBeenCalled();
    expect(result.current.state.publishedOpen).toBe(false);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(upsertImages.mock.calls[0][0]).toHaveLength(2);
    expect(
      upsertImages.mock.calls[0][0].every(
        (row: { listing_id: string }) => row.listing_id === "draft-1",
      ),
    ).toBe(true);
    expect(uploadImage.mock.calls.filter(([arg]) => arg.file.name === "b.jpg")).toHaveLength(1);
    expect(upsertImages.mock.invocationCallOrder[0]).toBeLessThan(
      createListing.mock.invocationCallOrder[0],
    );
  });

  it.each(["bildesvar", "publiseringssvar"])(
    "gjenbruker samme bilder og annonse etter tapt %s",
    async (lost) => {
      const rows = new Map<string, unknown>();
      let imageAttempt = 0;
      listImages.mockImplementation(async () => ({ data: [...rows.values()], error: null }));
      upsertImages.mockImplementation(async (images: Array<{ id: string }>) => {
        images.forEach((image) => rows.set(image.id, image));
        if (lost === "bildesvar" && imageAttempt++ === 0) throw new Error("Svaret gikk tapt");
        return { error: null };
      });
      if (lost === "publiseringssvar")
        createListing.mockRejectedValueOnce(new Error("Svaret gikk tapt"));
      createListing.mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
      const { result } = setup([
        {
          id: "a",
          file: new File(["a"], "a.jpg"),
          thumbFile: new File(["a"], "a-thumb.jpg"),
          previewUrl: "",
        },
      ]);
      act(() => result.current.publishOnce(values));
      await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
      act(() => result.current.publishOnce(values));
      await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
      expect(rows.size).toBe(1);
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(result.current.state.publishedId).toBe("draft-1");
    },
  );
  it("fullfører nytt forsøk med 100 allerede tilknyttede bilder", async () => {
    const rows = new Map<string, { id: string }>();
    listImages.mockImplementation(async () => ({ data: [...rows.values()], error: null }));
    upsertImages.mockImplementation(async (images: Array<{ id: string }>) => {
      if (rows.size === 100) throw new Error("listing_image_limit");
      images.forEach((row) => rows.set(row.id, row));
      return { error: null };
    });
    createListing
      .mockRejectedValueOnce(new Error("Publiseringssvaret gikk tapt"))
      .mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const images = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      file: new File(["a"], `${i}.jpg`),
      thumbFile: new File(["a"], `${i}-thumb.jpg`),
      previewUrl: "",
    }));
    const { result } = setup(images);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect(rows.size).toBe(100);
    expect(upsertImages).toHaveBeenCalledTimes(1);
  });
  it("tar med fjerning, rekkefølge og bildetekst når brukeren prøver igjen", async () => {
    const rows = new Map<string, { id: string; sort_order: number; caption: string | null }>();
    listImages.mockImplementation(async () => ({ data: [...rows.values()], error: null }));
    upsertImages.mockImplementation(
      async (images: Array<{ id: string; sort_order: number; caption: string | null }>) => {
        images.forEach((row) => rows.set(row.id, row));
        return { error: null };
      },
    );
    deleteImages.mockImplementation(async (_column: string, ids: string[]) => {
      ids.forEach((id) => rows.delete(id));
      return { error: null };
    });
    updateImage.mockImplementation(
      async (fields: { sort_order: number; caption: string | null }, id: string) => {
        rows.set(id, { ...rows.get(id)!, ...fields });
        return { error: null };
      },
    );
    createListing
      .mockRejectedValueOnce(new Error("Publisering avvist"))
      .mockResolvedValue({ id: "draft-1", kaupet_code: "ABC123" });
    const images = ["a", "b"].map((id) => ({
      id,
      file: new File([id], `${id}.jpg`),
      thumbFile: new File([id], `${id}-thumb.jpg`),
      previewUrl: "",
      caption: "",
    }));
    const { result, rerender } = setup(images);
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    images.splice(0, 1);
    images[0].caption = "Ny bildetekst";
    rerender();
    act(() => result.current.publishOnce(values));
    await waitFor(() => expect(result.current.state.publishedOpen).toBe(true));
    expect([...rows.values()]).toEqual([
      expect.objectContaining({ sort_order: 0, caption: "Ny bildetekst" }),
    ]);
  });
});
