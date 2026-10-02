import { describe, expect, it } from "vitest";

import { searchTabAction } from "./last-search-context";

describe("searchTabAction", () => {
  it("går til siste søk fra en annen fane", () => {
    expect(searchTabAction(false, 0)).toBe("navigate");
    expect(searchTabAction(false, 500)).toBe("navigate");
  });

  it("ruller først til toppen, deretter fokus i søkefeltet", () => {
    expect(searchTabAction(true, 500)).toBe("scroll-top");
    expect(searchTabAction(true, 0)).toBe("focus");
  });
});
