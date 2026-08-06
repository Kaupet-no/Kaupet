// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNominatimSearch } from "./use-nominatim-search";

const mockResult = { place_id: 1, display_name: "Oslo, Norge", lat: "59.9", lon: "10.7" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockResult],
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useNominatimSearch", () => {
  it("does not fetch below the minimum query length", async () => {
    renderHook(() => useNominatimSearch("o"));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("debounces before fetching and returns results", async () => {
    const { result, rerender } = renderHook(({ q }) => useNominatimSearch(q), {
      initialProps: { q: "" },
    });
    await act(() => rerender({ q: "oslo" }));

    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(fetch).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(() => vi.runOnlyPendingTimersAsync());
    expect(result.current.results).toEqual([mockResult]);
    expect(result.current.loading).toBe(false);
  });

  it("clears results on a non-OK response instead of leaving stale data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    const { result } = renderHook(() => useNominatimSearch("oslo"));

    await act(() => vi.advanceTimersByTimeAsync(400));
    await act(() => vi.runOnlyPendingTimersAsync());

    expect(result.current.results).toEqual([]);
  });
});
