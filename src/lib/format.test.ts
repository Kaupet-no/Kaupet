import { describe, expect, it } from "vitest";

import { priceRange } from "./format";

describe("priceRange", () => {
  it("returner null under 3 datapunkter", () => {
    expect(priceRange([])).toBeNull();
    expect(priceRange([100])).toBeNull();
    expect(priceRange([100, 200])).toBeNull();
  });

  it("beregner 25.–75.-persentil av prisene", () => {
    expect(priceRange([1000, 1200, 1500, 2000, 2400])).toEqual({ low: 1200, high: 2000 });
  });

  it("er ikke følsom for rekkefølge på input", () => {
    expect(priceRange([2400, 1000, 2000, 1200, 1500])).toEqual({ low: 1200, high: 2000 });
  });
});
