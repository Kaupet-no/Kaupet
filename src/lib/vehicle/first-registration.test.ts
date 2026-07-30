import { describe, expect, it } from "vitest";

import { firstRegistrationYear } from "./first-registration";

describe("firstRegistrationYear", () => {
  it("reads the year from an ISO date", () => {
    expect(firstRegistrationYear("2018-05-14")).toBe(2018);
  });

  it("reads the year from a day-first Norwegian date", () => {
    expect(firstRegistrationYear("14.05.2018")).toBe(2018);
  });

  it("returns null rather than NaN for missing or year-less values", () => {
    expect(firstRegistrationYear(null)).toBeNull();
    expect(firstRegistrationYear(undefined)).toBeNull();
    expect(firstRegistrationYear("")).toBeNull();
    expect(firstRegistrationYear("ukjent")).toBeNull();
  });
});
