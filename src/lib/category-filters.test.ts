import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findInvalidDateAttribute,
  normalizeDateAttributes,
  applyAttributeFilters,
  effectiveFiltersForCategory,
  filterDependencyMet,
  todayIsoDate,
  searchFilterDependencyMet,
  getMissingRequiredFilters,
  isBoatCategory,
  normalizeFilter,
  normalizeNumericAttributes,
  findNonNumericAttribute,
  retainSearchAttributes,
  NUMERIC_DIGIT_CAPS,
  splitPrimaryFilters,
  type AttributeFilterValue,
  type CategoryFilter,
  type CategoryNode,
} from "./category-filters";

const cats: CategoryNode[] = [
  { id: "main", parent_id: null },
  { id: "sub", parent_id: "main" },
  { id: "other", parent_id: null },
];
const byId = new Map(cats.map((c) => [c.id, c]));

function f(
  partial: Partial<CategoryFilter> & { category_id: string; key: string },
): CategoryFilter {
  return {
    id: `${partial.category_id}-${partial.key}`,
    label_nb: partial.key,
    type: "select",
    unit: null,
    options: null,
    sort_order: 0,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
    ...partial,
  };
}

describe("effectiveFiltersForCategory", () => {
  it("returns nothing for a null category", () => {
    expect(effectiveFiltersForCategory(null, [f({ category_id: "main", key: "a" })], byId)).toEqual(
      [],
    );
  });

  it("inherits filters from parent categories", () => {
    const filters = [
      f({ category_id: "main", key: "brand" }),
      f({ category_id: "sub", key: "size" }),
    ];
    const result = effectiveFiltersForCategory("sub", filters, byId).map((x) => x.key);
    expect(result).toEqual(expect.arrayContaining(["brand", "size"]));
    expect(result).toHaveLength(2);
  });

  it("does not include filters from sibling/unrelated categories", () => {
    const filters = [f({ category_id: "other", key: "x" })];
    expect(effectiveFiltersForCategory("sub", filters, byId)).toEqual([]);
  });

  it("lets a child filter override an inherited parent filter with the same key", () => {
    const filters = [
      f({ category_id: "main", key: "color", label_nb: "parent" }),
      f({ category_id: "sub", key: "color", label_nb: "child" }),
    ];
    const result = effectiveFiltersForCategory("sub", filters, byId);
    expect(result).toHaveLength(1);
    expect(result[0].label_nb).toBe("child");
  });

  it("sorts by sort_order", () => {
    const filters = [
      f({ category_id: "sub", key: "b", sort_order: 20 }),
      f({ category_id: "sub", key: "a", sort_order: 10 }),
    ];
    expect(effectiveFiltersForCategory("sub", filters, byId).map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("isBoatCategory", () => {
  it("identifies a category through its inherited boat_type filter", () => {
    const filters = [f({ category_id: "main", key: "boat_type" })];

    expect(isBoatCategory("sub", filters, byId)).toBe(true);
    expect(isBoatCategory("other", filters, byId)).toBe(false);
    expect(isBoatCategory(null, filters, byId)).toBe(false);
  });
});
describe("getMissingRequiredFilters", () => {
  it("treats zero, negative, non-finite, and string dimensions as invalid", () => {
    const filters = [
      f({ category_id: "sub", key: "width_cm", type: "number" }),
      f({ category_id: "sub", key: "height_cm", type: "number" }),
      f({ category_id: "sub", key: "depth_cm", type: "number" }),
    ];

    expect(
      getMissingRequiredFilters("sub", filters, byId, {
        width_cm: 0,
        height_cm: -1,
        depth_cm: "40",
      }),
    ).toHaveLength(3);
    expect(
      getMissingRequiredFilters("sub", filters, byId, {
        width_cm: 120,
        height_cm: 80,
        depth_cm: 40,
      }),
    ).toEqual([]);
  });

  it("does not require an is_optional cm dimension left unset", () => {
    const filters = [
      f({ category_id: "sub", key: "width_cm", type: "number", is_optional: true }),
      f({ category_id: "sub", key: "material", type: "select" }),
    ];

    expect(getMissingRequiredFilters("sub", filters, byId, { material: "tre" })).toEqual([]);
    expect(getMissingRequiredFilters("sub", filters, byId, {})).toHaveLength(1);
    expect(getMissingRequiredFilters("sub", filters, byId, {})[0].key).toBe("material");
  });

  it("requires compatible models only for a specific-fitment listing", () => {
    const filters = [
      f({
        category_id: "main",
        key: "part_fitment_scope",
        type: "select",
      }),
      f({
        category_id: "main",
        key: "part_fitment_vehicle_ids",
        type: "multiselect",
        depends_on_key: "part_fitment_scope",
        depends_on_value: "specific",
      }),
    ];
    expect(getMissingRequiredFilters("main", filters, byId, {})).toHaveLength(1);
    expect(
      getMissingRequiredFilters("main", filters, byId, {
        part_fitment_scope: "specific",
      }),
    ).toHaveLength(1);
    expect(
      getMissingRequiredFilters("main", filters, byId, {
        part_fitment_scope: "universal",
      }),
    ).toEqual([]);
  });
});

describe("normalizeFilter", () => {
  it("coerces non-array options to null", () => {
    const row = {
      id: "1",
      category_id: "c",
      key: "k",
      label_nb: "K",
      type: "number",
      unit: "km",
      options: null as unknown,
      sort_order: 0,
      is_primary: true,
    };
    expect(normalizeFilter(row).options).toBeNull();
    expect(normalizeFilter({ ...row, options: [{ value: "a", label_nb: "A" }] }).options).toEqual([
      { value: "a", label_nb: "A" },
    ]);
  });
});
describe("numeric dimension caps", () => {
  it("limits dimension inputs to four digits", () => {
    expect(NUMERIC_DIGIT_CAPS.width_cm).toBe(4);
    expect(NUMERIC_DIGIT_CAPS.height_cm).toBe(4);
    expect(NUMERIC_DIGIT_CAPS.depth_cm).toBe(4);
    expect(NUMERIC_DIGIT_CAPS.length_cm).toBe(4);
  });
});

describe("splitPrimaryFilters", () => {
  it("puts is_primary filters first, secondary the rest, preserving order within each", () => {
    const filters = [
      f({ category_id: "sub", key: "a", is_primary: true }),
      f({ category_id: "sub", key: "b", is_primary: false }),
      f({ category_id: "sub", key: "c", is_primary: true }),
    ];
    const { primary, secondary } = splitPrimaryFilters(filters);
    expect(primary.map((x) => x.key)).toEqual(["a", "c"]);
    expect(secondary.map((x) => x.key)).toEqual(["b"]);
  });
});

function fakeQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const q = {
    calls,
    or: (...args: unknown[]) => {
      calls.push({ method: "or", args });
      return q;
    },
    contains: (...args: unknown[]) => {
      calls.push({ method: "contains", args });
      return q;
    },
    gte: (...args: unknown[]) => {
      calls.push({ method: "gte", args });
      return q;
    },
    lte: (...args: unknown[]) => {
      calls.push({ method: "lte", args });
      return q;
    },
  };
  return q;
}

describe("applyAttributeFilters", () => {
  it("keeps listings with the attribute unset when excluding values", () => {
    const filters: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: ["el"] },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([
      {
        method: "or",
        args: ["attributes->>fuel_type.is.null,attributes->>fuel_type.not.in.(el)"],
      },
    ]);
  });

  it("does nothing when the exclude list is empty", () => {
    const filters: Record<string, AttributeFilterValue> = {
      fuel_type: { kind: "exclude", values: [] },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([]);
  });

  it("compares range filters as jsonb (->), not text (->>), so numbers sort numerically", () => {
    // A regression test for a real bug: `->>` extracts JSON as text, so
    // Postgres compared "78000" against "100000" lexicographically (both
    // start differently at the first digit) instead of numerically — a
    // listing with mileage_km: 78000 failed a `<= 100000` filter and
    // wrongly passed a `>= 100000` filter. `->` keeps the jsonb type, which
    // Postgres compares numerically for JSON numbers.
    const filters: Record<string, AttributeFilterValue> = {
      mileage_km: { kind: "range", min: 0, max: 100000 },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([
      { method: "gte", args: ["attributes->mileage_km", 0] },
      { method: "lte", args: ["attributes->mileage_km", 100000] },
    ]);
  });

  it("matches a part listing's vehicle-model array by containment", () => {
    const filters: Record<string, AttributeFilterValue> = {
      part_fitment_vehicle_ids: { kind: "multiselect", values: ["model-1"] },
    };
    const q = applyAttributeFilters(fakeQuery(), filters);
    expect(q.calls).toEqual([
      {
        method: "contains",
        args: ["attributes", { part_fitment_vehicle_ids: ["model-1"] }],
      },
    ]);
  });
});

describe("retainSearchAttributes", () => {
  const brand = f({ category_id: "main", key: "brand", type: "brand_select" });
  const model = f({ category_id: "main", key: "model", type: "model_select" });
  const motor = f({
    category_id: "main",
    key: "motor",
    type: "select",
    options: [{ value: "uten_motor", label_nb: "Uten motor" }],
  });
  const hp = f({
    category_id: "main",
    key: "hp",
    type: "range",
    depends_on_key: "motor",
    depends_on_not_value: "uten_motor",
  });
  const color = f({
    category_id: "main",
    key: "color",
    options: [{ value: "rod", label_nb: "Rød" }],
  });
  const filters = [brand, model, motor, hp, color];
  const range: AttributeFilterValue = { kind: "range", min: 100 };

  it.each([
    { kind: "select", value: "diesel" },
    { kind: "multiselect", values: ["gass", "diesel"] },
    { kind: "exclude", values: ["diesel"] },
  ] as AttributeFilterValue[])("drops an option absent from the new category ($kind)", (value) => {
    const fuel = f({
      category_id: "other",
      key: "fuel_type",
      options: [{ value: "gass", label_nb: "Gass" }],
    });
    expect(retainSearchAttributes({ fuel_type: value }, [fuel], { dropUnknown: true })).toEqual({
      kept: {},
      dropped: ["fuel_type"],
    });
  });

  it.each([
    { kind: "select", value: "gass" },
    { kind: "multiselect", values: ["gass"] },
    { kind: "exclude", values: ["gass"] },
  ] as AttributeFilterValue[])("keeps valid options in the new category ($kind)", (value) => {
    const fuel = f({
      category_id: "other",
      key: "fuel_type",
      options: [{ value: "gass", label_nb: "Gass" }],
    });
    expect(
      retainSearchAttributes({ fuel_type: value }, [fuel], { dropUnknown: true }).kept,
    ).toEqual({ fuel_type: value });
  });

  it("keeps reference-table brand and model values without static options", () => {
    const values: Record<string, AttributeFilterValue> = {
      brand: { kind: "select", value: "Volvo" },
      model: { kind: "select", value: "XC60" },
      hp: range,
    };
    expect(
      retainSearchAttributes(values, [brand, model, { ...hp, depends_on_key: null }], {
        dropUnknown: true,
      }).kept,
    ).toEqual(values);
  });

  it("drops dependencies after removing an invalid option, regardless of key order", () => {
    const fuel = f({
      category_id: "other",
      key: "motor",
      options: [{ value: "gass", label_nb: "Gass" }],
    });
    expect(
      retainSearchAttributes(
        { hp: range, motor: { kind: "select", value: "diesel" } },
        [fuel, { ...hp, depends_on_value: "diesel", depends_on_not_value: null }],
        { dropUnknown: true },
      ).kept,
    ).toEqual({});
  });

  it("drops Modell once Merke is cleared", () => {
    const { kept, dropped } = retainSearchAttributes(
      { model: { kind: "multiselect", values: ["V70"] } },
      filters,
    );
    expect(kept).toEqual({});
    expect(dropped).toEqual(["model"]);
  });

  it("drops a value whose explicit dependency no longer holds", () => {
    const { kept } = retainSearchAttributes(
      { motor: { kind: "select", value: "uten_motor" }, hp: range },
      filters,
    );
    expect(Object.keys(kept)).toEqual(["motor"]);
  });

  it("keeps unknown keys unless dropUnknown is set", () => {
    const values = { part_number: { kind: "text", value: "123" } as AttributeFilterValue };
    expect(retainSearchAttributes(values, filters).kept).toEqual(values);
    expect(retainSearchAttributes(values, filters, { dropUnknown: true }).dropped).toEqual([
      "part_number",
    ]);
  });

  it("keeps values shared by the new category's filters", () => {
    const { kept } = retainSearchAttributes(
      { color: { kind: "select", value: "rod" }, frame: { kind: "select", value: "M" } },
      [color],
      { dropUnknown: true },
    );
    expect(Object.keys(kept)).toEqual(["color"]);
  });
});

describe("normalisering av tallattributter (ekvivalensklasser)", () => {
  const filters = [f({ category_id: "main", key: "year", type: "number" })];

  it.each([
    ["2020", 2020],
    ["0", 0],
    ["-12.5", -12.5],
    ["150 000", 150000],
    ["1\u00a0500", 1500],
    ["12,5", 12.5],
    ["12,50", 12.5],
    ["1234,567", 1234.567],
    [2020, 2020],
  ])("normaliserer gyldig tall %j til %j", (year, expected) => {
    const attributes = { year, brand: "2020" };
    const normalized = normalizeNumericAttributes("sub", filters, byId, attributes);
    expect(normalized).toEqual({ year: expected, brand: "2020" });
    expect(attributes.year).toBe(year);
    expect(findNonNumericAttribute("sub", filters, byId, normalized)).toBeNull();
  });

  it.each([
    "",
    "oops",
    "12,500",
    "-1,500",
    "150.000",
    "-1.500",
    "æøå😀",
    "0x10",
    "Infinity",
    "9".repeat(400),
    true,
    ["2020"],
  ])("lar ugyldig tall %j bli avvist av valideringen", (year) => {
    const normalized = normalizeNumericAttributes("sub", filters, byId, { year });
    expect(normalized.year).toEqual(year);
    expect(findNonNumericAttribute("sub", filters, byId, normalized)?.key).toBe("year");
  });

  it.each([null, undefined])("beholder et usatt valgfritt felt %j", (year) => {
    const normalized = normalizeNumericAttributes("sub", filters, byId, { year });
    expect(normalized.year).toBe(year);
    expect(findNonNumericAttribute("sub", filters, byId, normalized)).toBeNull();
  });

  it("respekterer barnets filtertype og ignorerer andre kategorier", () => {
    const overridden = [...filters, f({ category_id: "sub", key: "year", type: "select" })];
    expect(normalizeNumericAttributes("sub", overridden, byId, { year: "2020" })).toEqual({
      year: "2020",
    });
    expect(normalizeNumericAttributes("other", filters, byId, { year: "2020" })).toEqual({
      year: "2020",
    });
  });
});

describe("datoattributter", () => {
  const filters = [f({ category_id: "main", key: "next_eu_control", type: "date" })];
  const extra = [{ key: "first_registration_date", label_nb: "Førstegangsregistrering" }];
  const normalize = (attributes: Record<string, unknown>) =>
    normalizeDateAttributes("sub", filters, byId, attributes, extra);
  const findInvalid = (attributes: Record<string, unknown>) =>
    findInvalidDateAttribute("sub", filters, byId, attributes, extra);

  it("normaliserer ISO, norsk format og Excel-serienummer til ISO", () => {
    expect(normalize({ next_eu_control: "2027-05-31" }).next_eu_control).toBe("2027-05-31");
    expect(normalize({ next_eu_control: "1.5.2027" }).next_eu_control).toBe("2027-05-01");
    // 46538 = 2027-05-31 i Excel
    expect(normalize({ first_registration_date: 46538 }).first_registration_date).toBe(
      "2027-05-31",
    );
    expect(normalize({ next_eu_control: "snart" }).next_eu_control).toBe("snart");
  });

  it("finner datoer som ikke er gyldig ISO", () => {
    expect(findInvalid({ next_eu_control: "2027-05-31" })).toBeNull();
    expect(findInvalid({ next_eu_control: "" })).toBeNull();
    expect(findInvalid({ next_eu_control: "2027-13-01" })?.key).toBe("next_eu_control");
    expect(findInvalid({ first_registration_date: "31.12" })?.label_nb).toBe(
      "Førstegangsregistrering",
    );
    expect(findInvalid({ next_eu_control: 46538 })?.key).toBe("next_eu_control");
  });

  it("normaliserer Excel-serienummer som tekst (ekvivalensklasser og grenseverdier)", () => {
    expect(normalize({ next_eu_control: " 46538 " }).next_eu_control).toBe("2027-05-31");
    expect(normalize({ next_eu_control: "2958465" }).next_eu_control).toBe("9999-12-31");
    for (const value of ["0", "-1", "2958466", "46538.5", "46538abc", "", "   "]) {
      expect(normalize({ next_eu_control: value }).next_eu_control).toBe(value);
    }
    expect(findInvalid({ next_eu_control: "46538" })?.key).toBe("next_eu_control");
  });

  it("styres av filtertypen, ikke nøkkelen", () => {
    const textFilters = [f({ category_id: "main", key: "next_eu_control", type: "text" })];
    expect(findInvalidDateAttribute("sub", textFilters, byId, { next_eu_control: "snart" })).toBe(
      null,
    );
    expect(
      findInvalidDateAttribute("sub", filters, byId, { first_registration_date: "31.12" }),
    ).toBeNull();
  });
});

describe("alternativer til en frist (Mangler/Fritatt EU-kontroll)", () => {
  const date = f({ category_id: "main", key: "next_eu_control", type: "date" });
  const status = f({
    category_id: "main",
    key: "eu_control_status",
    is_optional: true,
    depends_on_key: "next_eu_control",
    options: [
      { value: "missing", label_nb: "Mangler EU-kontroll" },
      { value: "exempt", label_nb: "Fritatt for EU-kontroll" },
    ],
  });
  const filters = [date, status];
  const missing = (attributes: Record<string, string>) =>
    getMissingRequiredFilters("sub", filters, byId, attributes).map((x) => x.key);

  afterEach(() => vi.useRealTimers());
  beforeEach(() => vi.setSystemTime(new Date("2026-10-15T12:00:00")));

  it("gjelder bare når datoen er tom eller passert (grenseverdier rundt i dag)", () => {
    expect(filterDependencyMet(status, {})).toBe(true);
    expect(filterDependencyMet(status, { next_eu_control: "" })).toBe(true);
    expect(filterDependencyMet(status, { next_eu_control: "2026-10-14" })).toBe(true);
    expect(filterDependencyMet(status, { next_eu_control: "2026-10-15" })).toBe(false);
    expect(filterDependencyMet(status, { next_eu_control: "2027-01-01" })).toBe(false);
  });

  it("regner «i dag» i norsk tid, også når prosessen går i UTC", () => {
    // 00:30 i Oslo, men fortsatt 15. oktober i UTC (workeren).
    vi.setSystemTime(new Date("2026-10-15T22:30:00Z"));
    expect(todayIsoDate()).toBe("2026-10-16");
    expect(filterDependencyMet(status, { next_eu_control: "2026-10-15" })).toBe(true);
  });

  it("krever dato i dag eller senere, med mindre et alternativ er valgt", () => {
    expect(missing({})).toEqual(["next_eu_control"]);
    expect(missing({ next_eu_control: "2026-10-14" })).toEqual(["next_eu_control"]);
    expect(missing({ next_eu_control: "2026-10-15" })).toEqual([]);
    expect(missing({ eu_control_status: "missing" })).toEqual([]);
    expect(missing({ next_eu_control: "2026-01-01", eu_control_status: "exempt" })).toEqual([]);
    // Et utdatert alternativ ved en fremtidig dato gjelder ikke, men datoen er gyldig.
    expect(missing({ next_eu_control: "2027-01-01", eu_control_status: "missing" })).toEqual([]);
  });

  it("godtar fortsatt passerte datoer i datofelt uten alternativer", () => {
    expect(
      getMissingRequiredFilters("sub", [date], byId, { next_eu_control: "2020-01-01" }),
    ).toEqual([]);
  });

  it("skjules i søket når tidligste dato er i dag eller senere", () => {
    expect(searchFilterDependencyMet(status, {}, filters)).toBe(true);
    expect(
      searchFilterDependencyMet(
        status,
        { next_eu_control: { kind: "date_min", value: "2027-01-01" } },
        filters,
      ),
    ).toBe(false);
  });
});

describe("eldre fritaksfelt under klientovergangen", () => {
  const filters = [
    f({ category_id: "main", key: "brand", type: "brand_select", unit: "bil", is_optional: true }),
    f({ category_id: "main", key: "next_eu_control", type: "date" }),
    f({ category_id: "main", key: "eu_control_exempt", type: "boolean", is_optional: true }),
    f({
      category_id: "main",
      key: "eu_control_status",
      is_optional: true,
      depends_on_key: "next_eu_control",
    }),
  ];

  it("skjuler det gamle feltet bare når erstatningen finnes", () => {
    expect(effectiveFiltersForCategory("sub", filters, byId).map((x) => x.key)).not.toContain(
      "eu_control_exempt",
    );
    expect(
      effectiveFiltersForCategory(
        "sub",
        filters.filter((x) => x.key !== "eu_control_status"),
        byId,
      ).map((x) => x.key),
    ).toContain("eu_control_exempt");
  });

  it.each([
    [true, []],
    [false, ["next_eu_control"]],
  ])(
    "tolker eldre fritak %s ved publiseringsvalidering (beslutningstabell)",
    (eu_control_exempt, expected) => {
      expect(
        getMissingRequiredFilters("sub", filters, byId, { eu_control_exempt }).map((x) => x.key),
      ).toEqual(expected);
    },
  );
});
