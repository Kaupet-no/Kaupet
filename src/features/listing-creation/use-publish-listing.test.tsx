// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createListing, getUser, showErrorToast } = vi.hoisted(() => ({
  createListing: vi.fn(),
  getUser: vi.fn(),
  showErrorToast: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser } },
}));
vi.mock("@/lib/listings.functions", () => ({ createListing }));
vi.mock("@/lib/storage", () => ({
  uploadListingImage: vi.fn(),
  uploadListingImageThumb: vi.fn(),
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

function setup() {
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
          images: [],
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
    vi.clearAllMocks();
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
});
