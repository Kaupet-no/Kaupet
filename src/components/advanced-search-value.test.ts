import { describe, expect, it } from "vitest";

import {
  criteriaToValue,
  defaultAdvancedSearchValue,
  valueToCriteria,
} from "./advanced-search-value";

describe("advanced search value", () => {
  it("beholder attributtfilter ved konvertering til og fra lagret kriterium", () => {
    const value = {
      ...defaultAdvancedSearchValue(),
      attributes: {
        fuel_type: { kind: "select" as const, value: "electric" },
      },
    };

    expect(criteriaToValue(valueToCriteria(value)).attributes).toEqual(value.attributes);
  });
});
