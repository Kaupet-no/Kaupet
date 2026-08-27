// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { AttributeFields } from "./attribute-fields";

const filters: CategoryFilter[] = [
  {
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
  },
];

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: filters }),
}));

describe("AttributeFields", () => {
  it("annonserer obligatoriske felt og kobler valideringsfeil til feltet", () => {
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
});
