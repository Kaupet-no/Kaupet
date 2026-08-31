import { describe, expect, it } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { buildStructuredSearchSuggestions } from "./structured-search-suggestions";

const filters: CategoryFilter[] = [
  {
    id: "fuel",
    category_id: "vehicle",
    key: "fuel_type",
    label_nb: "Drivstoff",
    type: "select",
    unit: null,
    options: [
      { value: "electric", label_nb: "Elektrisk" },
      { value: "diesel", label_nb: "Diesel" },
    ],
    sort_order: 1,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
  {
    id: "camera",
    category_id: "vehicle",
    key: "rear_camera",
    label_nb: "Ryggekamera",
    type: "boolean",
    unit: null,
    options: null,
    sort_order: 2,
    is_primary: false,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  },
];

describe("buildStructuredSearchSuggestions", () => {
  it("foreslår optioner og booleanfilter etter relevans", () => {
    expect(buildStructuredSearchSuggestions("elektrisk", filters, {})).toEqual([
      expect.objectContaining({
        id: "fuel_type:electric",
        label: "Drivstoff: Elektrisk",
        value: { kind: "select", value: "electric" },
      }),
    ]);

    expect(buildStructuredSearchSuggestions("ryggekamera", filters, {})).toEqual([
      expect.objectContaining({
        id: "rear_camera:true",
        label: "Ryggekamera",
        value: { kind: "boolean", value: true },
      }),
    ]);
  });

  it("utelater allerede valgte optioner", () => {
    expect(
      buildStructuredSearchSuggestions("elektrisk", filters, {
        fuel_type: { kind: "select", value: "electric" },
      }),
    ).toEqual([]);
  });

  it("begrenser antallet og beholder deterministisk rekkefølge", () => {
    const suggestions = buildStructuredSearchSuggestions("e", filters, {}, 1);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.id).toBe("fuel_type:electric");
  });
});
