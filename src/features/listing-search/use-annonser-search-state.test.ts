// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAnnonserSearchState } from "./use-annonser-search-state";

vi.mock("@/lib/haptics", () => ({
  hapticNotification: vi.fn(),
}));

const baseSearch = {
  q: "",
  category: "",
  categories: [] as string[],
  sort: "new" as const,
  attrs: "",
  qMode: "all" as const,
  extraGroups: [],
  catMode: "any" as const,
  conditions: [],
  min: undefined,
  max: undefined,
  includeFree: true,
  lat: undefined,
  lng: undefined,
  radius: undefined,
  loc: undefined,
};

const categories = [
  { id: "root-1", slug: "elektronikk", name_nb: "Elektronikk", parent_id: null },
  { id: "child-1", slug: "mobil", name_nb: "Mobil", parent_id: "root-1" },
];

function setup(overrides?: Partial<typeof baseSearch>) {
  const navigate = vi.fn();
  const setQDraft = vi.fn();
  const { result } = renderHook(() =>
    useAnnonserSearchState({
      search: { ...baseSearch, ...overrides },
      navigate,
      categories,
      allFilters: [],
      setQDraft,
    }),
  );
  return { result, navigate, setQDraft };
}

describe("useAnnonserSearchState", () => {
  it("merges the legacy single `category` param into effectiveCategories", () => {
    const { result } = setup({ category: "mobil", categories: ["elektronikk"] });

    expect(result.current.effectiveCategories).toEqual(["elektronikk", "mobil"]);
  });

  it("does not duplicate a category already present in `categories`", () => {
    const { result } = setup({ category: "elektronikk", categories: ["elektronikk"] });

    expect(result.current.effectiveCategories).toEqual(["elektronikk"]);
  });

  it("splits the query text into individual search terms", () => {
    const { result } = setup({ q: "  trek marlin   sykkel " });

    expect(result.current.terms).toEqual(["trek", "marlin", "sykkel"]);
  });

  it("updateSearch merges a patch onto the previous search params", () => {
    const { result, navigate } = setup();

    act(() => result.current.updateSearch({ sort: "price_asc" }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const searchFn = navigate.mock.calls[0][0].search;
    expect(searchFn({ ...baseSearch, q: "kept" })).toEqual(
      expect.objectContaining({ q: "kept", sort: "price_asc" }),
    );
  });

  it("resetFilters navigates to a cleared search and clears the query draft", () => {
    const { result, navigate, setQDraft } = setup();

    act(() => result.current.resetFilters());

    expect(setQDraft).toHaveBeenCalledWith("");
    const searchFn = navigate.mock.calls[0][0].search;
    expect(searchFn()).toEqual({ q: "", category: "", sort: "new" });
  });

  it("handleLocationChange writes lat/lng/radius/loc onto the URL", () => {
    const { result, navigate } = setup();

    act(() =>
      result.current.handleLocationChange({ lat: 59.9, lng: 10.7, radius: 5, label: "Oslo" }),
    );

    const searchFn = navigate.mock.calls[0][0].search;
    expect(searchFn(baseSearch)).toEqual(
      expect.objectContaining({ lat: 59.9, lng: 10.7, radius: 5, loc: "Oslo" }),
    );
  });

  it("handleAttrValueChange encodes the updated attribute filters onto the URL", () => {
    const { result, navigate } = setup();

    act(() => result.current.handleAttrValueChange("color", { kind: "select", value: "blue" }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const searchFn = navigate.mock.calls[0][0].search;
    const next = searchFn(baseSearch);
    expect(typeof next.attrs).toBe("string");
  });
});
