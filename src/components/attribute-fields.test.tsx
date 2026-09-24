// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { AttributeFields } from "./attribute-fields";

const filters: { current: CategoryFilter[] } = { current: [] };

const textFilter: CategoryFilter = {
  id: "filter-color",
  category_id: "category-1",
  key: "color",
  label_nb: "Farge",
  type: "text",
  unit: null,
  options: null,
  sort_order: 1,
  is_primary: true,
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
};

function selectFilter(optionCount: number): CategoryFilter {
  return {
    id: "filter-style",
    category_id: "category-1",
    key: "style",
    label_nb: "Stil",
    type: "select",
    unit: null,
    options: Array.from({ length: optionCount }, (_, i) => ({
      value: `opt-${i}`,
      label_nb: `Alternativ ${i}`,
    })),
    sort_order: 1,
    is_primary: true,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: true,
  };
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: filters.current }),
}));

afterEach(() => {
  cleanup();
  filters.current = [];
});

describe("AttributeFields", () => {
  it("annonserer obligatoriske felt og kobler valideringsfeil til feltet", () => {
    filters.current = [textFilter];
    render(
      <AttributeFields
        categoryId="category-1"
        categories={[{ id: "category-1", parent_id: null }]}
        value={{}}
        onChange={vi.fn()}
        required
        showErrors
      />,
    );

    const input = screen.getByLabelText("Farge *");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("attr-color-error");
    expect(screen.getByText("Fyll inn farge")).toBeTruthy();
  });

  it("rendrer ≤6 alternativer som chip-radiogruppe med mulighet til å fjerne valgfritt valg", () => {
    filters.current = [selectFilter(4)];
    const onChange = vi.fn();
    render(
      <AttributeFields
        categoryId="category-1"
        categories={[{ id: "category-1", parent_id: null }]}
        value={{ style: "opt-1" }}
        onChange={onChange}
        required
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    const group = screen.getByRole("radiogroup", { name: /Stil.*valgfritt/ });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4);

    const selected = screen.getByRole("radio", { name: "Alternativ 1" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(selected);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("rendrer >6 alternativer fortsatt som Select", () => {
    filters.current = [selectFilter(7)];
    render(
      <AttributeFields
        categoryId="category-1"
        categories={[{ id: "category-1", parent_id: null }]}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
