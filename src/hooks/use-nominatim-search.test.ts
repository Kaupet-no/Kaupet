// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNominatimSearch } from "./use-nominatim-search";

const mockResult = { place_id: 1, display_name: "Oslo, Norge", lat: "59.9", lon: "10.7" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockResult],
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNominatimSearch", () => {
  it("sender ingenting før brukeren starter et eksplisitt søk", () => {
    renderHook(() => useNominatimSearch());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("avviser søk under minste lengde", async () => {
    const { result } = renderHook(() => useNominatimSearch());
    await act(() => result.current.search("o"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("henter treff etter eksplisitt søk", async () => {
    const { result } = renderHook(() => useNominatimSearch());
    await act(() => result.current.search("oslo"));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.results).toEqual([mockResult]);
    expect(result.current.searchedQuery).toBe("oslo");
    expect(result.current.loading).toBe(false);
  });

  it("tømmer treff ved feilrespons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    const { result } = renderHook(() => useNominatimSearch());

    await act(() => result.current.search("oslo"));

    expect(result.current.results).toEqual([]);
  });
});
