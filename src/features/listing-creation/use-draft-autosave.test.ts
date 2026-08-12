// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftAutosave } from "./use-draft-autosave";

vi.mock("@/lib/toast", () => ({
  showSuccessToast: vi.fn(),
}));

const saveDraftListingMock = vi.fn();
vi.mock("@/lib/listings.functions", () => ({
  saveDraftListing: (...args: unknown[]) => saveDraftListingMock(...args),
}));

vi.mock("@/lib/vehicle/vehicle-title", () => ({
  computeVehicleTitle: () => "",
}));

const loadDraftImagesMock = vi.fn().mockResolvedValue([]);
const saveDraftImagesMock = vi.fn().mockResolvedValue(undefined);
const clearDraftImagesMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./draft-image-store", () => ({
  loadDraftImages: (...args: unknown[]) => loadDraftImagesMock(...args),
  saveDraftImages: (...args: unknown[]) => saveDraftImagesMock(...args),
  clearDraftImages: (...args: unknown[]) => clearDraftImagesMock(...args),
}));

const DRAFT_KEY = "kaupet_draft_ny_annonse";
const DRAFT_ID_KEY = "kaupet_draft_id";

const baseFields = {
  title: "",
  subtitle: "",
  description: "",
  selectedParentId: "",
  categoryId: "",
  condition: null,
  isFree: false,
  canShip: "pickup",
  priceNok: "",
  postalCode: "",
  city: "",
  coords: null,
  isVehicle: false,
  attributes: {},
  images: [],
  setImages: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  saveDraftListingMock.mockReset();
  loadDraftImagesMock.mockReset().mockResolvedValue([]);
  saveDraftImagesMock.mockClear();
  clearDraftImagesMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftAutosave", () => {
  it("loads a recent draft from localStorage on mount and exposes it as hasDraftData", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "Sykkel til salgs", saved_at: Date.now() }),
    );
    localStorage.setItem(DRAFT_ID_KEY, "draft-123");

    const { result } = renderHook(() => useDraftAutosave(baseFields));

    expect(result.current.hasDraftData).toEqual(
      expect.objectContaining({ title: "Sykkel til salgs" }),
    );
    expect(result.current.draftId).toBe("draft-123");
  });

  it("discards a draft older than 7 days instead of surfacing it", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "Gammelt utkast", saved_at: eightDaysAgo }),
    );

    const { result } = renderHook(() => useDraftAutosave(baseFields));

    expect(result.current.hasDraftData).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("does not surface a draft with no title or description", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ saved_at: Date.now() }));

    const { result } = renderHook(() => useDraftAutosave(baseFields));

    expect(result.current.hasDraftData).toBeNull();
  });

  it("saveDraftToSupabase refuses to save when the effective title is under 5 characters", async () => {
    const { result } = renderHook(() => useDraftAutosave({ ...baseFields, title: "Hi" }));

    const id = await act(() => result.current.saveDraftToSupabase());

    expect(id).toBeNull();
    expect(saveDraftListingMock).not.toHaveBeenCalled();
  });

  it("saveDraftToSupabase creates a new draft and remembers the returned id", async () => {
    saveDraftListingMock.mockResolvedValue({ id: "new-draft-id", kaupet_code: "ABC123" });
    const { result } = renderHook(() =>
      useDraftAutosave({ ...baseFields, title: "En fin sykkel" }),
    );

    const id = await act(() => result.current.saveDraftToSupabase());

    expect(id).toBe("new-draft-id");
    expect(result.current.draftId).toBe("new-draft-id");
    expect(result.current.draftSaveError).toBe(false);
    expect(localStorage.getItem(DRAFT_ID_KEY)).toBe("new-draft-id");
    expect(saveDraftListingMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "En fin sykkel" }) }),
    );
  });

  it("saveDraftToSupabase sets draftSaveError when the save fails", async () => {
    saveDraftListingMock.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() =>
      useDraftAutosave({ ...baseFields, title: "En fin sykkel" }),
    );

    const id = await act(() => result.current.saveDraftToSupabase());

    expect(id).toBeNull();
    expect(result.current.draftSaveError).toBe(true);
  });

  it("ensureDraftId reuses an existing draftId instead of saving again", async () => {
    localStorage.setItem(DRAFT_ID_KEY, "already-there");
    const { result } = renderHook(() =>
      useDraftAutosave({ ...baseFields, title: "En fin sykkel" }),
    );

    // draftId hydrates from localStorage in an effect — wait for it.
    await waitFor(() => expect(result.current.draftId).toBe("already-there"));

    const id = await act(() => result.current.ensureDraftId());

    expect(id).toBe("already-there");
    expect(saveDraftListingMock).not.toHaveBeenCalled();
  });

  it("clearDraftStorage removes both localStorage keys", () => {
    localStorage.setItem(DRAFT_KEY, "x");
    localStorage.setItem(DRAFT_ID_KEY, "y");
    const { result } = renderHook(() => useDraftAutosave(baseFields));

    act(() => result.current.clearDraftStorage());

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFT_ID_KEY)).toBeNull();
  });

  it("discardLocalDraftBanner clears the localStorage draft and hasDraftData, but keeps the draft id", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: "Noe", saved_at: Date.now() }));
    localStorage.setItem(DRAFT_ID_KEY, "keep-me");
    const { result } = renderHook(() => useDraftAutosave(baseFields));

    expect(result.current.hasDraftData).not.toBeNull();

    act(() => result.current.discardLocalDraftBanner());

    expect(result.current.hasDraftData).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFT_ID_KEY)).toBe("keep-me");
  });

  it("restoreDraft applies saved fields onto the form and clears hasDraftData", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        title: "Restored title",
        postal_code: "0150",
        category_id: "cat-1",
        saved_at: Date.now(),
      }),
    );
    const { result } = renderHook(() => useDraftAutosave(baseFields));

    const setValue = vi.fn();
    const setSelectedParentId = vi.fn();
    const setLocationMethod = vi.fn();
    const setAttributes = vi.fn();

    await act(() =>
      result.current.restoreDraft({
        setValue,
        setSelectedParentId,
        setLocationMethod,
        setAttributes,
        setCoords: vi.fn(),
      }),
    );

    expect(setValue).toHaveBeenCalledWith("title", "Restored title");
    expect(setValue).toHaveBeenCalledWith("postal_code", "0150");
    expect(setLocationMethod).toHaveBeenCalledWith("postal");
    expect(setValue).toHaveBeenCalledWith("category_id", "cat-1");
    expect(result.current.hasDraftData).toBeNull();
  });

  it("restoreDraft also restores saved attributes", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        title: "Restored title",
        attributes: { brand: "Volvo", year: 2020 },
        saved_at: Date.now(),
      }),
    );
    const { result } = renderHook(() => useDraftAutosave(baseFields));

    const setValue = vi.fn();
    const setSelectedParentId = vi.fn();
    const setLocationMethod = vi.fn();
    const setAttributes = vi.fn();

    await act(() =>
      result.current.restoreDraft({
        setValue,
        setSelectedParentId,
        setLocationMethod,
        setAttributes,
        setCoords: vi.fn(),
      }),
    );

    expect(setAttributes).toHaveBeenCalledWith({ brand: "Volvo", year: 2020 });
  });

  it("restores locally persisted images with the rest of the draft", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "Restored title", saved_at: Date.now() }),
    );
    const restored = [{ id: "image-1" }];
    loadDraftImagesMock.mockResolvedValue(restored);
    const setImages = vi.fn();
    const { result } = renderHook(() => useDraftAutosave({ ...baseFields, setImages }));

    await act(() =>
      result.current.restoreDraft({
        setValue: vi.fn(),
        setSelectedParentId: vi.fn(),
        setLocationMethod: vi.fn(),
        setAttributes: vi.fn(),
        setCoords: vi.fn(),
      }),
    );

    expect(setImages).toHaveBeenCalledWith(restored);
  });

  it("persists attributes into the localStorage draft", () => {
    vi.useFakeTimers();
    renderHook(() =>
      useDraftAutosave({ ...baseFields, title: "En fin sykkel", attributes: { brand: "Trek" } }),
    );

    act(() => vi.advanceTimersByTime(2000));

    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(saved.attributes).toEqual({ brand: "Trek" });
  });
});
