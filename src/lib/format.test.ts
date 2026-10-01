import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateLong,
  formatDateLongPadded,
  formatDateShort,
  formatDateTime,
  formatDateTimeLong,
  formatDateTimeMedium,
  formatDayMonth,
  formatMonthYear,
  formatNokNumber,
  formatWtbMaxPrice,
  priceRange,
} from "./format";

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

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const ISO = "2026-10-01T14:05:09";
const D = new Date(ISO);

describe("datoformattering", () => {
  it("formatDate / formatDateTime følger nb-NO", () => {
    expect(formatDate(ISO)).toBe(D.toLocaleDateString("nb-NO"));
    expect(formatDateTime(ISO)).toBe(D.toLocaleString("nb-NO"));
    expect(norm(formatDate(ISO))).toBe("1.10.2026");
  });

  it("dato-varianter gir forventet tekst", () => {
    expect(formatDateShort(ISO)).toBe("1. okt. 2026");
    expect(formatDateLong(ISO)).toBe("1. oktober 2026");
    expect(formatDateLongPadded("2026-10-01T12:00:00")).toBe("01. oktober 2026");
    expect(formatMonthYear(ISO)).toBe("oktober 2026");
    expect(formatDayMonth(ISO)).toBe("1. okt.");
  });

  it("dato+tid-varianter inneholder klokkeslett", () => {
    expect(norm(formatDateTimeMedium(ISO))).toContain("14:05");
    expect(norm(formatDateTimeLong(ISO))).toContain("14:05");
    expect(formatDateTimeLong(ISO)).toContain("oktober 2026");
  });
});

describe("formatNokNumber", () => {
  it("bruker norske tusenskiller", () => {
    expect(norm(formatNokNumber(1234567))).toBe("1 234 567");
  });
});

describe("formatWtbMaxPrice", () => {
  it("viser 0 som «Kun gratis», siden matchingen da bare tar gratis-annonser", () => {
    expect(formatWtbMaxPrice(0)).toBe("Kun gratis");
    expect(formatWtbMaxPrice(1500)).toBe(`${formatNokNumber(1500)} kr`);
  });
});
