// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { SearchInterpretation } from "./search-interpretation";

afterEach(cleanup);

const filter: CategoryFilter = {
  id: "fuel",
  category_id: "car",
  key: "fuel_type",
  label_nb: "Drivstoff",
  type: "select",
  unit: null,
  options: [{ value: "diesel", label_nb: "Diesel" }],
  sort_order: 0,
  is_primary: true,
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
};

describe("SearchInterpretation", () => {
  it("viser kriteriene i rekkefølge og bruker eksisterende filterhandlinger", () => {
    const onCategoryChange = vi.fn();
    const onAttributeChange = vi.fn();
    const { getAllByRole, getByRole } = render(
      <SearchInterpretation
        criteria={[
          { kind: "category", slug: "bil", source: "text" },
          {
            kind: "attribute",
            key: "fuel_type",
            value: { kind: "select", value: "diesel" },
            source: "text",
          },
        ]}
        categories={[{ slug: "bil", name_nb: "Bil" }]}
        filters={[filter]}
        onCategoryChange={onCategoryChange}
        onAttributeChange={onAttributeChange}
      />,
    );

    expect(getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Bil",
      "Drivstoff: Diesel",
    ]);

    fireEvent.click(getByRole("button", { name: "Fjern Bil fra søket" }));
    fireEvent.click(getByRole("button", { name: "Fjern Drivstoff: Diesel fra søket" }));

    expect(onCategoryChange).toHaveBeenCalledWith(undefined);
    expect(onAttributeChange).toHaveBeenCalledWith("fuel_type", undefined);
  });
  it("viser prisgrense og kan fjerne den", () => {
    const onPriceRemove = vi.fn();
    const { getByRole } = render(
      <SearchInterpretation
        criteria={[
          {
            kind: "price",
            max: 300000,
            source: "text",
            matchedText: "under 300000kr",
          },
        ]}
        categories={[]}
        filters={[]}
        onCategoryChange={vi.fn()}
        onAttributeChange={vi.fn()}
        onPriceRemove={onPriceRemove}
      />,
    );

    fireEvent.click(getByRole("button", { name: /Fjern Under .*søket/ }));
    expect(onPriceRemove).toHaveBeenCalledWith("under 300000kr");
  });
});
