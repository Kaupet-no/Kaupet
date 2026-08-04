import { describe, expect, it } from "vitest";

import { expandBodyTypeSearchValues } from "./body-type-search-expansion";

describe("expandBodyTypeSearchValues", () => {
  it("adds kombi when suv is searched", () => {
    expect(expandBodyTypeSearchValues(["suv"]).sort()).toEqual(["kombi", "suv"]);
  });

  it("does not add suv when kombi is searched", () => {
    expect(expandBodyTypeSearchValues(["kombi"])).toEqual(["kombi"]);
  });

  it("leaves unrelated values untouched", () => {
    expect(expandBodyTypeSearchValues(["sedan"])).toEqual(["sedan"]);
  });

  it("dedupes when kombi is already selected alongside suv", () => {
    expect(expandBodyTypeSearchValues(["suv", "kombi"]).sort()).toEqual(["kombi", "suv"]);
  });

  it("handles an empty list", () => {
    expect(expandBodyTypeSearchValues([])).toEqual([]);
  });
});
