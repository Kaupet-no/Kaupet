// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { GenericAttributesGrid } from "./generic-attributes-grid";

const filter = (over: Partial<CategoryFilter> & Pick<CategoryFilter, "key" | "label_nb">) =>
  ({
    id: over.key,
    category_id: "stol",
    type: "text",
    unit: null,
    options: null,
    sort_order: 0,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
    ...over,
  }) as CategoryFilter;

vi.mock("@/hooks/use-category-filters", () => ({
  useAllCategoryFilters: () => ({
    data: [
      filter({ key: "material", label_nb: "Materiale", sort_order: 0 }),
      filter({
        key: "style",
        label_nb: "Stil",
        type: "select",
        options: [{ value: "skandinavisk", label_nb: "Skandinavisk" }],
        sort_order: 1,
      }),
      filter({ key: "width_cm", label_nb: "Bredde", type: "number", unit: "cm", sort_order: 2 }),
      filter({ key: "assembled", label_nb: "Montert", type: "boolean", sort_order: 3 }),
      filter({ key: "depth_cm", label_nb: "Dybde", type: "number", unit: "cm", sort_order: 4 }),
    ],
  }),
}));

vi.mock("@/hooks/use-categories", () => ({
  useCategories: () => ({ data: [{ id: "stol", parent_id: null }] }),
}));

afterEach(cleanup);

describe("GenericAttributesGrid", () => {
  it("viser kategoriegenskapene med etikett, enhet og opsjonsnavn", () => {
    // Wizarden krever disse feltene; før denne komponenten fantes ble de
    // bare rendret bak eierens redigeringsmodus, aldri for en kjøper.
    render(
      <GenericAttributesGrid
        categoryId="stol"
        attributes={{
          material: "Bjørk og stoff",
          style: "skandinavisk",
          width_cm: 68,
          assembled: false,
        }}
      />,
    );

    expect(screen.getByText("Egenskaper")).toBeTruthy();
    expect(screen.getByText("Bjørk og stoff")).toBeTruthy();
    expect(screen.getByText("Skandinavisk")).toBeTruthy();
    expect(screen.getByText("68 cm")).toBeTruthy();
    expect(screen.getByText("Nei")).toBeTruthy();
    // Uutfylte felt skal ikke gi tomme tiles.
    expect(screen.queryByText("Dybde")).toBeNull();
  });

  it("rendrer ingenting når ingen egenskaper har verdi", () => {
    const { container } = render(<GenericAttributesGrid categoryId="stol" attributes={{}} />);

    expect(container.firstChild).toBeNull();
  });

  it("viser emptyHint i stedet for ingenting når eieren redigerer", () => {
    render(
      <GenericAttributesGrid categoryId="stol" attributes={{}} emptyHint="Klikk for å redigere" />,
    );

    expect(screen.getByText("Klikk for å redigere")).toBeTruthy();
  });
});
