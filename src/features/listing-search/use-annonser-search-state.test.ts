// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAnnonserSearchState } from "./use-annonser-search-state";
import type { CategoryFilter } from "@/lib/category-filters";

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

function setup(overrides?: Partial<typeof baseSearch>, allFilters: CategoryFilter[] = []) {
  const navigate = vi.fn();
  const setQDraft = vi.fn();
  const { result } = renderHook(() =>
    useAnnonserSearchState({
      search: { ...baseSearch, ...overrides },
      navigate,
      categories,
      allFilters,
      setQDraft,
    }),
  );
  return { result, navigate, setQDraft };
}

/** Samme nøkkel, ulikt vokabular i to kategorier — se pruningen i hooken. */
function fuelFilter(categoryId: string, values: string[]): CategoryFilter {
  return {
    id: `fuel-${categoryId}`,
    category_id: categoryId,
    key: "fuel_type",
    label_nb: "Drivstoff",
    type: "select",
    unit: null,
    options: values.map((value) => ({ value, label_nb: value })),
    sort_order: 1,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  };
}

describe("useAnnonserSearchState", () => {
  it("beholder en attributtverdi som finnes i den valgte kategorien", () => {
    const { navigate } = setup({ categories: ["mobil"], attrs: "fuel_type:s:el" }, [
      fuelFilter("child-1", ["el", "diesel"]),
    ]);

    expect(navigate).not.toHaveBeenCalled();
  });

  it("nullstiller kategorispesifikke filtre når kategorien byttes", () => {
    // "el" finnes ikke i Elektronikk sitt vokabular for samme nøkkel.
    const { navigate } = setup({ categories: ["elektronikk"], attrs: "fuel_type:s:el" }, [
      fuelFilter("child-1", ["el", "diesel"]),
      fuelFilter("root-1", ["gass", "kull"]),
    ]);

    expect(navigate).toHaveBeenCalledTimes(1);
    const patch = navigate.mock.calls[0][0].search({ ...baseSearch, attrs: "fuel_type:s:el" });
    expect(patch.attrs).toBe("");
  });

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

  it("commits the complete panel draft in one navigation", () => {
    const { result, navigate } = setup();

    act(() =>
      result.current.applyPanelDraft({
        value: {
          ...result.current.appliedSearch.value,
          terms: ["grønn", "sykkel"],
          categories: ["mobil"],
          min: 500,
          location: { lat: 59.91, lng: 10.75, radius: 25, label: "Oslo" },
        },
        attributes: { color: { kind: "select", value: "green" } },
      }),
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    const next = navigate.mock.calls[0][0].search(baseSearch);
    expect(next).toEqual(
      expect.objectContaining({
        q: "grønn sykkel",
        categories: ["mobil"],
        min: 500,
        lat: 59.91,
        lng: 10.75,
        radius: 25,
        loc: "Oslo",
      }),
    );
    expect(next.attrs).toContain("color");
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
