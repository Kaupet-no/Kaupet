import { describe, expect, it } from "vitest";

import { isValidOrganizationNumber, normalizeOrganizationNumber } from "./organization-number";

describe("organization number", () => {
  it("removes grouping whitespace without changing digits", () => {
    expect(normalizeOrganizationNumber(" 974 760 673 ")).toBe("974760673");
    expect(normalizeOrganizationNumber("974\t760\n673")).toBe("974760673");
  });

  it.each([
    ["974760673", true],
    ["974 760 673", true],
    ["974760674", false],
    ["97476067", false],
    ["9747606730", false],
    ["974-760-673", false],
    ["abcdefgh1", false],
  ])("validates %s as %s", (value, expected) => {
    expect(isValidOrganizationNumber(value)).toBe(expected);
  });

  it("rejects a check digit of 10", () => {
    // The first eight digits sum to 12 (remainder 1), which would produce 10.
    expect(isValidOrganizationNumber("000000400")).toBe(false);
  });
});
