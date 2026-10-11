// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaceSearch } from "./use-place-search";
import { searchPlaces } from "@/lib/geocode";

vi.mock("@/lib/geocode", () => ({ searchPlaces: vi.fn() }));
const searchMock = vi.mocked(searchPlaces);
const oslo = { id: "307915", label: "Oslo", lat: 59.91273, lng: 10.74609 };

beforeEach(() => {
  searchMock.mockReset().mockResolvedValue([oslo]);
});

describe("usePlaceSearch", () => {
  it("sender ingenting før eksplisitt søk", () => {
    renderHook(() => usePlaceSearch());
    expect(searchMock).not.toHaveBeenCalled();
  });
  it("avviser for korte søk", async () => {
    const { result } = renderHook(() => usePlaceSearch());
    await act(() => result.current.search("o"));
    expect(searchMock).not.toHaveBeenCalled();
  });
  it("søker via serverlaget med trimmet tekst", async () => {
    const { result } = renderHook(() => usePlaceSearch());
    await act(() => result.current.search(" oslo "));
    expect(searchMock).toHaveBeenCalledWith("oslo", 6);
    expect(result.current.results).toEqual([oslo]);
    expect(result.current.searchedQuery).toBe("oslo");
    expect(result.current.loading).toBe(false);
  });
  it("skiller tjenestefeil fra ingen treff", async () => {
    searchMock.mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => usePlaceSearch());
    await act(() => result.current.search("oslo"));
    expect(result.current.error).toBeTruthy();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
  it("tomme treff er ikke en tjenestefeil", async () => {
    searchMock.mockResolvedValue([]);
    const { result } = renderHook(() => usePlaceSearch());
    await act(() => result.current.search("ukjent"));
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });
  it("et gammelt svar overskriver ikke et nyere søk", async () => {
    let resolveOld!: (value: (typeof oslo)[]) => void;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result } = renderHook(() => usePlaceSearch());
    let old!: Promise<void>;
    act(() => {
      old = result.current.search("bergen");
    });
    await act(() => result.current.search("oslo"));
    await act(async () => {
      resolveOld([]);
      await old;
    });
    expect(result.current.results).toEqual([oslo]);
    expect(result.current.searchedQuery).toBe("oslo");
  });
  it("clear hindrer et pågående svar i å gjenopprette treff", async () => {
    let resolveSearch!: (value: (typeof oslo)[]) => void;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const { result } = renderHook(() => usePlaceSearch());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.search("oslo");
    });
    act(() => result.current.clear());
    await act(async () => {
      resolveSearch([oslo]);
      await pending;
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.searchedQuery).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
