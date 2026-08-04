import { describe, expect, it } from "vitest";

import { decodeAttrFilters, encodeAttrFilters } from "./search-schema";
import type { AttributeFilterValue } from "@/lib/category-filters";

describe("encodeAttrFilters / decodeAttrFilters", () => {
  it("round-trips an exclude filter", () => {
    const values: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el", "diesel"] },
    };
    const encoded = encodeAttrFilters(values);
    expect(encoded).toBe("fuel_type:x:el|diesel");
    expect(decodeAttrFilters(encoded)).toEqual(values);
  });

  it("round-trips an exclude filter with a single value", () => {
    const values: Record<string, AttributeFilterValue> = {
      body_type: { kind: "exclude", values: ["kombi"] },
    };
    expect(decodeAttrFilters(encodeAttrFilters(values))).toEqual(values);
  });

  it("round-trips a mix of exclude and multiselect", () => {
    const values: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el"] },
      body_type: { kind: "multiselect", values: ["suv"] },
    };
    expect(decodeAttrFilters(encodeAttrFilters(values))).toEqual(values);
  });
});
