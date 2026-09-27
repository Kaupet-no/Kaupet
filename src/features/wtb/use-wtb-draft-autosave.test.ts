// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveWtbDraftMock, getLatestWtbDraftMock } = vi.hoisted(() => ({
  saveWtbDraftMock: vi.fn(),
  getLatestWtbDraftMock: vi.fn(),
}));

vi.mock("@/lib/wtb-listings.functions", () => ({
  saveWtbDraft: saveWtbDraftMock,
  getLatestWtbDraft: getLatestWtbDraftMock,
  discardWtbDraft: vi.fn().mockResolvedValue(undefined),
}));

import { useWtbDraftAutosave } from "./use-wtb-draft-autosave";

const fields = {
  title: "Ønsker sykkel",
  description: "",
  category_id: null,
  max_price_nok: "" as number | string,
  notify_matches: false,
  attributes: {},
  checked_keys: [],
};

describe("useWtbDraftAutosave", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    saveWtbDraftMock.mockReset();
    getLatestWtbDraftMock.mockReset().mockResolvedValue(null);
    saveWtbDraftMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  afterEach(() => {
    // Unmounts hooks between tests so a leftover visibilitychange/pagehide
    // listener from a previous test's still-mounted hook doesn't also fire
    // (and overwrite localStorage) when a later test dispatches the same
    // window/document event — bit us once, see the two pagehide tests below.
    cleanup();
    vi.useRealTimers();
  });
  it("lagrer et versjonert kjøpsønske uten å berøre salgsutkastet", () => {
    localStorage.setItem("kaupet_draft_sell_listing", "sell-draft");
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
    expect(localStorage.getItem("kaupet_draft_sell_listing")).toBe("sell-draft");
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
    expect(result.current.restorableDraft?.notify_matches).toBe(false);
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

  it("gjenoppretter makspris og varsling fra serverutkast", async () => {
    getLatestWtbDraftMock.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000002",
      title: fields.title,
      description: "Beskrivelse",
      category_id: null,
      max_price_nok: 10_000,
      notify_matches: true,
      attributes: { brand: "Trek" },
      updated_at: new Date().toISOString(),
    });

    const { result } = renderHook(() => useWtbDraftAutosave(fields, true));
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(result.current.restorableDraft).toMatchObject({
      max_price_nok: 10_000,
      notify_matches: true,
    });
  });

  it("normaliserer makspris fra input-streng før serverlagring", async () => {
    const { result } = renderHook(() =>
      useWtbDraftAutosave({ ...fields, max_price_nok: "10000", notify_matches: true }, true),
    );

    await act(async () => {
      await result.current.saveToServer();
    });

    expect(saveWtbDraftMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ max_price_nok: 10000, notify_matches: true }),
    });

    const { result: invalidResult } = renderHook(() =>
      useWtbDraftAutosave({ ...fields, max_price_nok: "10000001", notify_matches: true }, true),
    );
    await act(async () => {
      await invalidResult.current.saveToServer();
    });
    expect(saveWtbDraftMock).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ max_price_nok: null, notify_matches: true }),
    });
  });

  it("flusher en endring innenfor debounce-vinduet til localStorage ved pagehide (J4)", () => {
    const { rerender } = renderHook((f) => useWtbDraftAutosave(f, true), {
      initialProps: fields,
    });

    // Brukeren endrer maks pris og lukker/laster siden under to sekunder
    // senere — før den debouncede localStorage-lagringen rekker å fyre.
    act(() => {
      rerender({ ...fields, max_price_nok: 15_000 });
      vi.advanceTimersByTime(500);
    });
    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(JSON.parse(localStorage.getItem("kaupet_draft_want_listing") ?? "{}")).toMatchObject({
      max_price_nok: 15_000,
    });
  });

  it("overskriver ikke et lokalt utkast mens restore-kortet vises, ved pagehide", async () => {
    const oldDraft = {
      draft_kind: "want",
      draft_version: 1,
      saved_at: Date.now(),
      title: "Gammelt kjøpsønske",
      description: "",
      category_id: null,
      max_price_nok: "",
      notify_matches: false,
      attributes: {},
      checked_keys: [],
    };
    localStorage.setItem("kaupet_draft_want_listing", JSON.stringify(oldDraft));
    const { result, rerender } = renderHook((f) => useWtbDraftAutosave(f, true), {
      initialProps: fields,
    });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.restorableDraft).not.toBeNull();

    act(() => {
      rerender({ ...fields, max_price_nok: 15_000 });
      vi.advanceTimersByTime(500);
    });
    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(JSON.parse(localStorage.getItem("kaupet_draft_want_listing") ?? "{}")).toMatchObject(
      oldDraft,
    );
  });

  it("overskriver ikke serverutkast mens restore-valget står åpent", async () => {
    getLatestWtbDraftMock.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000003",
      title: fields.title,
      description: "Beskrivelse",
      category_id: null,
      max_price_nok: 10_000,
      notify_matches: true,
      attributes: {},
      updated_at: new Date().toISOString(),
    });
    renderHook(() => useWtbDraftAutosave(fields, true));

    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(saveWtbDraftMock).not.toHaveBeenCalled();
  });
});
