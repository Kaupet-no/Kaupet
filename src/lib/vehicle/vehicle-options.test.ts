import { afterEach, describe, expect, it, vi } from "vitest";
import { euControlStatusFromLookup, parseEuControlStatus } from "./vehicle-options";

afterEach(() => vi.useRealTimers());

describe("EU-status og frist", () => {
  it.each([
    ["missing", "2026-10-14", undefined, "missing"],
    ["missing", "2026-10-15", undefined, null],
    ["exempt", "2027-01-01", undefined, null],
    ["exempt", null, undefined, "exempt"],
    [undefined, null, true, "exempt"],
    [undefined, null, false, null],
    ["ugyldig", null, undefined, null],
    ["missing", "31.12.2027", undefined, "missing"],
    ["exempt", "31.12.2027", undefined, "exempt"],
    ["missing", "2027-02-30", undefined, "missing"],
  ])(
    "tolker status %s med frist %s (grenseverdier og eldre klient)",
    (status, date, legacy, expected) => {
      vi.setSystemTime(new Date("2026-10-15T12:00:00"));
      expect(parseEuControlStatus(status, date, legacy)).toBe(expected);
    },
  );
});

describe("EU-status fra SVV-oppslaget", () => {
  const base = {
    next_eu_control: null,
    first_registration_date: "2015-03-01",
    max_total_weight_kg: 750,
    avgiftsklasse_code: "101",
    classification_code: "M1",
  };

  it.each([
    ["passert frist", { next_eu_control: "2026-10-14" }, "missing"],
    ["frist i dag", { next_eu_control: "2026-10-15" }, null],
    ["fremtidig frist", { next_eu_control: "2027-01-01" }, null],
    ["ingen frist, personbil", {}, null],
    ["registrert 31.12.1959", { first_registration_date: "1959-12-31" }, "exempt"],
    ["registrert 01.01.1960", { first_registration_date: "1960-01-01" }, null],
    [
      "registrert før 1960, men med passert frist",
      { first_registration_date: "1955-06-01", next_eu_control: "2026-01-01" },
      "missing",
    ],
    ["tilhenger 3 500 kg", { avgiftsklasse_code: "701", max_total_weight_kg: 3500 }, "exempt"],
    ["tilhenger 3 501 kg", { avgiftsklasse_code: "701", max_total_weight_kg: 3501 }, null],
    ["tilhenger uten totalvekt", { avgiftsklasse_code: "701", max_total_weight_kg: null }, null],
    [
      "Tempo 100-tilhenger (har frist)",
      { avgiftsklasse_code: "701", next_eu_control: "2027-05-01" },
      null,
    ],
    ["O2 uten avgiftskode", { avgiftsklasse_code: null, classification_code: " o2 " }, "exempt"],
    ["O3 uten avgiftskode", { avgiftsklasse_code: null, classification_code: "O3" }, null],
  ])("%s", (_name, overrides, expected) => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    expect(euControlStatusFromLookup({ ...base, ...overrides })).toBe(expected);
  });
});
