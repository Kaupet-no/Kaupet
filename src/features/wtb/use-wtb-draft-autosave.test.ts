// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveWtbDraftMock } = vi.hoisted(() => ({
  saveWtbDraftMock: vi.fn(),
}));

vi.mock("@/lib/wtb-listings.functions", () => ({
  saveWtbDraft: saveWtbDraftMock,
  getLatestWtbDraft: vi.fn().mockResolvedValue(null),
  discardWtbDraft: vi.fn().mockResolvedValue(undefined),
}));

import { useWtbDraftAutosave } from "./use-wtb-draft-autosave";

const fields = {
  title: "Ønsker sykkel",
  description: "",
  category_id: null,
  max_price_nok: "" as const,
  attributes: {},
  checked_keys: [],
};

describe("useWtbDraftAutosave", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    saveWtbDraftMock.mockReset();
    saveWtbDraftMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("lagrer et versjonert kjøpsønske uten å berøre salgsutkastet", () => {
    localStorage.setItem("kaupet_draft_ny_annonse", "sell-draft");
    renderHook(() => useWtbDraftAutosave(fields, true));

    act(() => vi.advanceTimersByTime(2_001));

    const saved = JSON.parse(localStorage.getItem("kaupet_draft_want_listing") ?? "{}") as {
      draft_kind?: string;
      draft_version?: number;
      title?: string;
    };
    expect(saved).toMatchObject({
      draft_kind: "want",
      draft_version: 1,
      title: "Ønsker sykkel",
    });
    expect(localStorage.getItem("kaupet_draft_ny_annonse")).toBe("sell-draft");
  });
  it("lagrer gjestedraft lokalt når Supabase ikke er tilgjengelig", () => {
    const { result } = renderHook(() => useWtbDraftAutosave(fields, false));

    act(() => {
      result.current.flushLocalDraft();
    });

    expect(JSON.parse(localStorage.getItem("kaupet_draft_want_listing") ?? "{}")).toMatchObject({
      draft_kind: "want",
      title: "Ønsker sykkel",
    });
  });

  it("tilbyr et gyldig lagret utkast for gjenoppretting", async () => {
    localStorage.setItem(
      "kaupet_draft_want_listing",
      JSON.stringify({
        draft_kind: "want",
        draft_version: 1,
        saved_at: Date.now(),
        ...fields,
      }),
    );
    const { result } = renderHook(() => useWtbDraftAutosave(fields, true));

    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(result.current.restorableDraft?.title).toBe("Ønsker sykkel");
  });

  it("stopper lokal og serverbasert autolagring etter publisering", async () => {
    const { result } = renderHook(() => useWtbDraftAutosave(fields, true));
    await act(() => vi.advanceTimersByTimeAsync(2_001));
    expect(localStorage.getItem("kaupet_draft_want_listing")).not.toBeNull();

    act(() => result.current.clearAfterPublish());
    expect(localStorage.getItem("kaupet_draft_want_listing")).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(30_001));
    expect(localStorage.getItem("kaupet_draft_want_listing")).toBeNull();
    expect(saveWtbDraftMock).not.toHaveBeenCalled();
  });
});
