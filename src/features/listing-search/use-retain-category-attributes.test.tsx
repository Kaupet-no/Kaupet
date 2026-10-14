// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const filter = (key: string, category: string) => ({
  id: `${category}-${key}`,
  category_id: category,
  key,
  label_nb: key,
  type: "select",
  unit: null,
  options: [{ value: "red", label_nb: "Rød" }],
  sort_order: 0,
  is_primary: true,
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
});
vi.mock("@/components/attribute-fields", () => ({
  useAllCategoryFilters: () => ({
    data: [
      filter("color", "bil"),
      filter("fuel_type", "bil"),
      filter("color", "mc"),
      { ...filter("fuel_type", "grill"), options: [{ value: "gass", label_nb: "Gass" }] },
    ],
  }),
}));

import { useRetainCategoryAttributes } from "./use-retain-category-attributes";

// KG-29-F01 / KG-30-F01: kategoribytte beholdt skjulte filtre (lagret søk) eller
// tømte også felles verdier (desktop).
it("beholder verdier den nye kategorien har og fjerner resten", () => {
  const { result } = renderHook(() =>
    useRetainCategoryAttributes([
      { id: "bil", slug: "bil", name_nb: "Bil", parent_id: null },
      { id: "mc", slug: "mc", name_nb: "MC", parent_id: null },
    ]),
  );
  expect(
    result.current.retain(
      {
        color: { kind: "select", value: "red" },
        fuel_type: { kind: "select", value: "diesel" },
      },
      ["mc"],
    ),
  ).toMatchObject({
    kept: { color: { kind: "select", value: "red" } },
    droppedLabels: ["fuel_type"],
  });
});

it("kategoribytte fjerner diesel fra Grill og forklarer fjerningen", () => {
  const { result } = renderHook(() =>
    useRetainCategoryAttributes([
      { id: "grill", slug: "grill", name_nb: "Grill", parent_id: null },
    ]),
  );
  expect(
    result.current.retain({ fuel_type: { kind: "select", value: "diesel" } }, ["grill"]),
  ).toMatchObject({ kept: {}, droppedLabels: ["fuel_type"] });
});
