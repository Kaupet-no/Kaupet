import { describe, expect, it } from "vitest";

import { normalizeFilter } from "@/lib/category-filters";
import {
  criterionSummary,
  orderWtbCriteria,
  pruneWtbCriteria,
  wtbCriteriaSummary,
} from "./wtb-criteria-presentation";

const filters = [
  normalizeFilter({
    id: "type",
    category_id: "category",
    key: "type",
    label_nb: "Type",
    type: "select",
    options: [{ value: "mountain", label_nb: "Terrengsykkel" }],
    unit: null,
    sort_order: 1,
    is_primary: true,
  }),
  normalizeFilter({
    id: "frame",
    category_id: "category",
    key: "frame",
    label_nb: "Rammestørrelse",
    type: "range",
    unit: "cm",
    options: null,
    sort_order: 2,
    is_primary: true,
  }),
  normalizeFilter({
    id: "brand",
    category_id: "category",
    key: "brand",
    label_nb: "Merke",
    type: "brand_select",
    unit: null,
    options: null,
    sort_order: 3,
    is_primary: true,
  }),
];

describe("WTB-kriterieoversikt", () => {
  it("viser valgte kriterier før kriterier uten begrensning", () => {
    expect(orderWtbCriteria(filters, { frame: { min: 40 } }).map((filter) => filter.key)).toEqual([
      "frame",
      "type",
      "brand",
    ]);
  });

  it("bruker eksplisitt språk for tomme og ensidige intervaller", () => {
    expect(criterionSummary(filters[1], undefined)).toBe("Ingen begrensning");
    expect(criterionSummary(filters[1], { min: 2020 })).toBe("Fra 2020");
    expect(criterionSummary(filters[1], { max: 2024 })).toBe("Til 2024");
  });

  it("viser faktiske valgte kriterier i oppsummeringen", () => {
    expect(
      wtbCriteriaSummary(filters, {
        type: ["mountain"],
        frame: { min: 40, max: 70 },
        brand: "Trek",
      }),
    ).toBe("Type: Terrengsykkel · Rammestørrelse (cm): 40–70 · Merke: Trek");
  });
});

// KG-23-F02: skjulte kriterier fra forrige kategori ble matchet mot nye annonser.
describe("pruneWtbCriteria", () => {
  it("fjerner kriterier den nye kategorien ikke har, men beholder fritekst", () => {
    expect(
      pruneWtbCriteria({ type: ["mountain"], fuel_type: ["diesel"], __freetext: "ABS" }, filters),
    ).toEqual({ type: ["mountain"], __freetext: "ABS" });
  });

  it("fjerner avhengige kriterier når forutsetningen er borte", () => {
    const dependent = normalizeFilter({
      id: "motor",
      category_id: "category",
      key: "motor",
      label_nb: "Motor",
      type: "select",
      options: null,
      unit: null,
      sort_order: 3,
      is_primary: false,
      depends_on_key: "type",
      depends_on_value: "electric",
    });
    expect(pruneWtbCriteria({ motor: ["mid"] }, [...filters, dependent])).toEqual({});
  });
});
