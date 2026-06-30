import { describe, expect, it } from "vitest";

import {
  effectiveFiltersForCategory,
  normalizeFilter,
  type CategoryFilter,
  type CategoryNode,
} from "./category-filters";

const cats: CategoryNode[] = [
  { id: "main", parent_id: null },
  { id: "sub", parent_id: "main" },
  { id: "other", parent_id: null },
];
const byId = new Map(cats.map((c) => [c.id, c]));

function f(
  partial: Partial<CategoryFilter> & { category_id: string; key: string },
): CategoryFilter {
  return {
    id: `${partial.category_id}-${partial.key}`,
    label_nb: partial.key,
    type: "select",
    unit: null,
    options: null,
    sort_order: 0,
    ...partial,
  };
}

describe("effectiveFiltersForCategory", () => {
  it("returns nothing for a null category", () => {
    expect(effectiveFiltersForCategory(null, [f({ category_id: "main", key: "a" })], byId)).toEqual(
      [],
    );
  });

  it("inherits filters from parent categories", () => {
    const filters = [
      f({ category_id: "main", key: "brand" }),
      f({ category_id: "sub", key: "size" }),
    ];
    const result = effectiveFiltersForCategory("sub", filters, byId).map((x) => x.key);
    expect(result).toEqual(expect.arrayContaining(["brand", "size"]));
    expect(result).toHaveLength(2);
  });

  it("does not include filters from sibling/unrelated categories", () => {
    const filters = [f({ category_id: "other", key: "x" })];
    expect(effectiveFiltersForCategory("sub", filters, byId)).toEqual([]);
  });

  it("lets a child filter override an inherited parent filter with the same key", () => {
    const filters = [
      f({ category_id: "main", key: "color", label_nb: "parent" }),
      f({ category_id: "sub", key: "color", label_nb: "child" }),
    ];
    const result = effectiveFiltersForCategory("sub", filters, byId);
    expect(result).toHaveLength(1);
    expect(result[0].label_nb).toBe("child");
  });

  it("sorts by sort_order", () => {
    const filters = [
      f({ category_id: "sub", key: "b", sort_order: 20 }),
      f({ category_id: "sub", key: "a", sort_order: 10 }),
    ];
    expect(effectiveFiltersForCategory("sub", filters, byId).map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("normalizeFilter", () => {
  it("coerces non-array options to null", () => {
    const row = {
      id: "1",
      category_id: "c",
      key: "k",
      label_nb: "K",
      type: "number",
      unit: "km",
      options: null as unknown,
      sort_order: 0,
    };
    expect(normalizeFilter(row).options).toBeNull();
    expect(normalizeFilter({ ...row, options: [{ value: "a", label_nb: "A" }] }).options).toEqual([
      { value: "a", label_nb: "A" },
    ]);
  });
});
