import { describe, expect, it, vi } from "vitest";
import { buildActiveFilterItems } from "./active-filter-items";
import type { CategoryFilter } from "@/lib/category-filters";

const emptySearch = { q: "", qMode: "all" as const, extraGroups: [] };
const noop = vi.fn();

const filterDefaults = {
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
};

describe("buildActiveFilterItems", () => {
  it("returnerer ingen tagger for et tomt søk", () => {
    expect(buildActiveFilterItems({ search: emptySearch, terms: [], onUpdate: noop })).toEqual([]);
  });

  it("lager én tagg per fritekstord, og fjerning tar kun det ordet", () => {
    const onUpdate = vi.fn();
    const items = buildActiveFilterItems({
      search: emptySearch,
      terms: ["bil", "volvo"],
      onUpdate,
    });
    expect(items.map((i) => i.label)).toEqual(["bil", "volvo"]);
    items[0].onRemove();
    expect(onUpdate).toHaveBeenCalledWith({ q: "volvo" });
  });

  it("fjerner tomme ekstra-søkelinjer helt når siste ord i dem fjernes", () => {
    const onUpdate = vi.fn();
    const items = buildActiveFilterItems({
      search: {
        ...emptySearch,
        extraGroups: [{ id: "g1", mode: "all" as const, exclude: false, terms: ["rust"] }],
      },
      terms: [],
      onUpdate,
    });
    expect(items).toHaveLength(1);
    items[0].onRemove();
    expect(onUpdate).toHaveBeenCalledWith({ extraGroups: [] });
  });

  it("beskriver stedsfilteret og fjerner det via onRemoveLocation", () => {
    const onRemoveLocation = vi.fn();
    const items = buildActiveFilterItems({
      search: emptySearch,
      terms: [],
      onUpdate: noop,
      location: { lat: 59, lng: 10, radius: 25, label: "Oslo" },
      onRemoveLocation,
    });
    expect(items[0]).toMatchObject({ label: "Oslo · 25 km" });
    items[0].onRemove();
    expect(onRemoveLocation).toHaveBeenCalled();
  });

  it("lager én tagg per verdi for et multiselect-attributt", () => {
    const onRemoveAttr = vi.fn();
    const filter: CategoryFilter = {
      ...filterDefaults,
      id: "f1",
      category_id: "c1",
      key: "fuel_type",
      label_nb: "Drivstoff",
      type: "multiselect",
      unit: null,
      options: [
        { value: "diesel", label_nb: "Diesel" },
        { value: "el", label_nb: "Elektrisk" },
      ],
      sort_order: 0,
      is_primary: true,
    };
    const items = buildActiveFilterItems({
      search: emptySearch,
      terms: [],
      onUpdate: noop,
      attrFilters: [filter],
      attrValues: { fuel_type: { kind: "multiselect", values: ["diesel", "el"] } },
      onRemoveAttr,
    });
    expect(items.map((i) => i.label)).toEqual(["Drivstoff: Diesel", "Drivstoff: Elektrisk"]);
    items[1].onRemove();
    expect(onRemoveAttr).toHaveBeenCalledWith("fuel_type", "el");
  });
});
