import { describe, expect, it } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { criterionSummary, orderWtbCriteria } from "./wtb-criteria-presentation";

const filters = [
  { id: "brand", key: "brand", label_nb: "Merke", type: "select" },
  { id: "year", key: "year", label_nb: "Årsmodell", type: "range" },
] as CategoryFilter[];

describe("WTB-kriterieoversikt", () => {
  it("viser valgte kriterier før kriterier uten begrensning", () => {
    expect(orderWtbCriteria(filters, { year: { min: 2020 } }).map((filter) => filter.key)).toEqual([
      "year",
      "brand",
    ]);
  });

  it("bruker eksplisitt språk for tomme og ensidige intervaller", () => {
    expect(criterionSummary(filters[1], undefined)).toBe("Ingen begrensning");
    expect(criterionSummary(filters[1], { min: 2020 })).toBe("Fra 2020");
    expect(criterionSummary(filters[1], { max: 2024 })).toBe("Til 2024");
  });
});
