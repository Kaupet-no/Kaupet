import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEuControlStatus } from "./vehicle-options";

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
  ])(
    "tolker status %s med frist %s (grenseverdier og eldre klient)",
    (status, date, legacy, expected) => {
      vi.setSystemTime(new Date("2026-10-15T12:00:00"));
      expect(parseEuControlStatus(status, date, legacy)).toBe(expected);
    },
  );
});
