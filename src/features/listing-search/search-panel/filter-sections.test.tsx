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
const bodyFilter: CategoryFilter = {
  ...fuelFilter,
  id: "body",
  key: "body",
  label_nb: "Karosseri",
  options: [{ value: "suv", label_nb: "SUV" }],
  sort_order: 1,
};

function setup(
  section: "price" | "location" | "attributes" = "price",
  overrides: Partial<ReturnType<typeof defaultAdvancedSearchValue>> = {},
) {
  const value = { ...defaultAdvancedSearchValue(), categories: ["mobler"], ...overrides };
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

  it("summarizes both extra rules and any-word mode", () => {
    const { getByText } = setup("price", {
      qMode: "any",
      extraGroups: [{ id: "rule", mode: "all", exclude: false, terms: ["hybrid"] }],
    });

    fireEvent.click(getByText("Tilbake til filteroversikt"));

    expect(getByText("1 regel · Minst ett ord")).toBeTruthy();
  });

  it("disables price presets below the active minimum", () => {
    const { getByRole } = setup("price", { min: 120_000 });

    expect((getByRole("button", { name: /Inntil 50.000/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: /Inntil 100.000/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: /Inntil 250.000/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
  it("prioriterer filteret som matcher det aktive søket", () => {
    const value = { ...defaultAdvancedSearchValue(), categories: ["mobler"] };
    const { getByText, getAllByRole } = render(
      <SearchFilterSections
        value={value}
        setValue={() => {}}
        categories={categories}
        section="price"
        queryText="SUV"
        attributeFilters={[fuelFilter, bodyFilter]}
        attributeValues={{}}
        onAttributeChange={() => {}}
        includePrimary
      />,
    );

    fireEvent.click(getByText("Tilbake til filteroversikt"));
    const names = getAllByRole("button").map((button) => button.textContent ?? "");
    expect(names.findIndex((name) => name.includes("Karosseri"))).toBeLessThan(
      names.findIndex((name) => name.includes("Drivstoff")),
    );
  });
});
