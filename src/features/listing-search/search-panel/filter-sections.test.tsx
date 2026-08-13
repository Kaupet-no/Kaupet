// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import type { CategoryFilter } from "@/lib/category-filters";
import { SearchFilterSections } from "./filter-sections";

vi.mock("@/components/ui/native-sheet", () => ({
  NativeSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) => (open ? <div aria-label={title}>{children}</div> : null),
}));
vi.mock("@/components/advanced-search-sheet", () => ({
  CategoryPicker: () => <div>kategorivelger</div>,
}));
vi.mock("@/lib/native", () => ({ isNative: () => false }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

afterEach(cleanup);

const categories = [{ id: "cat", slug: "mobler", name_nb: "Møbler", parent_id: null }];
const fuelFilter: CategoryFilter = {
  id: "fuel",
  category_id: "cat",
  key: "fuel",
  label_nb: "Drivstoff",
  type: "select",
  unit: null,
  options: [
    { value: "electric", label_nb: "Elektrisk" },
    { value: "diesel", label_nb: "Diesel" },
  ],
  sort_order: 0,
  is_primary: true,
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
};

function setup(section: "price" | "location" | "attributes" = "price") {
  const value = { ...defaultAdvancedSearchValue(), categories: ["mobler"] };
  return render(
    <SearchFilterSections
      value={value}
      setValue={() => {}}
      categories={categories}
      section={section}
      attributeFilters={[fuelFilter]}
      attributeValues={{ fuel: { kind: "select", value: "electric" } }}
      onAttributeChange={() => {}}
      includePrimary
    />,
  );
}

describe("SearchFilterSections", () => {
  it("opens directly on the requested section and only renders that section", () => {
    const { getByText, queryByText } = setup("price");

    expect(getByText("Pris (NOK)")).toBeTruthy();
    expect(queryByText("Sted")).toBeNull();
    expect(queryByText("Alle filtre")).toBeNull();
  });

  it("opens category selection from the overview", () => {
    const { getByText } = setup("price");

    fireEvent.click(getByText("Tilbake til filteroversikt"));
    fireEvent.click(getByText("Kategori"));

    expect(getByText("kategorivelger")).toBeTruthy();
  });

  it("shows the selected value and opens the concrete primary filter", () => {
    const { getByText, queryByText } = setup("price");

    fireEvent.click(getByText("Tilbake til filteroversikt"));
    expect(getByText("Elektrisk")).toBeTruthy();
    fireEvent.click(getByText("Drivstoff"));

    expect(getByText("1 valgt")).toBeTruthy();
    expect(queryByText("Pris (NOK)")).toBeNull();
  });
});
