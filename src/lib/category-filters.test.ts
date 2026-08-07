import { describe, expect, it } from "vitest";

import {
  applyAttributeFilters,
  effectiveFiltersForCategory,
  normalizeFilter,
  splitPrimaryFilters,
  type AttributeFilterValue,
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
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
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
      is_primary: true,
    };
    expect(normalizeFilter(row).options).toBeNull();
    expect(normalizeFilter({ ...row, options: [{ value: "a", label_nb: "A" }] }).options).toEqual([
      { value: "a", label_nb: "A" },
    ]);
  });
});

describe("splitPrimaryFilters", () => {
  it("puts is_primary filters first, secondary the rest, preserving order within each", () => {
    const filters = [
      f({ category_id: "sub", key: "a", is_primary: true }),
      f({ category_id: "sub", key: "b", is_primary: false }),
      f({ category_id: "sub", key: "c", is_primary: true }),
    ];
    const { primary, secondary } = splitPrimaryFilters(filters);
    expect(primary.map((x) => x.key)).toEqual(["a", "c"]);
    expect(secondary.map((x) => x.key)).toEqual(["b"]);
  });
});

function fakeQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const q = {
    calls,
    or: (...args: unknown[]) => {
      calls.push({ method: "or", args });
      return q;
    },
    contains: (...args: unknown[]) => {
      calls.push({ method: "contains", args });
      return q;
    },
    gte: (...args: unknown[]) => {
      calls.push({ method: "gte", args });
      return q;
    },
    lte: (...args: unknown[]) => {
      calls.push({ method: "lte", args });
      return q;
    },
  };
  return q;
}

describe("applyAttributeFilters", () => {
  it("keeps listings with the attribute unset when excluding values", () => {
    const filters: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el"] },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([
      {
        method: "or",
        args: ["attributes->>fuel_type.is.null,attributes->>fuel_type.not.in.(el)"],
      },
    ]);
  });

  it("does nothing when the exclude list is empty", () => {
    const filters: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: [] },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([]);
  });

  it("compares range filters as jsonb (->), not text (->>), so numbers sort numerically", () => {
    // A regression test for a real bug: `->>` extracts JSON as text, so
    // Postgres compared "78000" against "100000" lexicographically (both
    // start differently at the first digit) instead of numerically — a
    // listing with mileage_km: 78000 failed a `<= 100000` filter and
    // wrongly passed a `>= 100000` filter. `->` keeps the jsonb type, which
    // Postgres compares numerically for JSON numbers.
    const filters: Record<string, AttributeFilterValue> = {
      mileage_km: { kind: "range", min: 0, max: 100000 },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([
      { method: "gte", args: ["attributes->mileage_km", 0] },
      { method: "lte", args: ["attributes->mileage_km", 100000] },
    ]);
  });
});
