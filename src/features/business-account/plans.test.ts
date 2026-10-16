import { describe, expect, it } from "vitest";

import { addMonthsClampedUtc } from "./plans";

// Forventede verdier = Postgres `timestamptz + make_interval(months => n)` i UTC,
// som mark_organization_location_charge_invoiced lagrer.
describe("addMonthsClampedUtc", () => {
  const add = (iso: string, months: number) =>
    addMonthsClampedUtc(new Date(iso), months).toISOString();

  it("klamper til siste dag i målmåneden", () => {
    expect(add("2027-01-31T12:00:00.000Z", 1)).toBe("2027-02-28T12:00:00.000Z");
    expect(add("2028-01-31T12:00:00.000Z", 1)).toBe("2028-02-29T12:00:00.000Z");
    expect(add("2027-03-31T00:00:00.000Z", 1)).toBe("2027-04-30T00:00:00.000Z");
  });

  it("håndterer flere måneder og årsskifte", () => {
    expect(add("2026-12-31T08:30:00.000Z", 2)).toBe("2027-02-28T08:30:00.000Z");
    expect(add("2027-01-31T12:00:00.000Z", 12)).toBe("2028-01-31T12:00:00.000Z");
    expect(add("2027-01-15T12:00:00.000Z", 1)).toBe("2027-02-15T12:00:00.000Z");
  });
});
