// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import type { CategoryFilter } from "@/lib/category-filters";
import { groupFilterRows } from "./filter-rows";
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
  CategorySlugPicker: () => <div>kategorivelger</div>,
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
    // Bare tilbakepilen peker til oversikten; selve oversikten er ikke rendret.
    expect(queryByText("Flere muligheter")).toBeNull();
  });

  it("viser kategori i samme panel og går tilbake til filteroversikten", () => {
    const { getByText, getByRole, queryByText } = setup("price");

    fireEvent.click(screen.getByRole("button", { name: "Tilbake til filteroversikt" }));
    fireEvent.click(getByText("Kategori"));

    expect(getByText("kategorivelger")).toBeTruthy();
    expect(getByRole("heading", { name: "Velg kategori" })).toBeTruthy();
    expect(queryByText("Pris (NOK)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tilbake til filteroversikt" }));
    expect(getByText("Kategori")).toBeTruthy();
    expect(queryByText("kategorivelger")).toBeNull();
  });

  it("åpner kategori direkte i desktop-sidekolonnen", () => {
    const { getByRole, getByText, queryByText } = render(
      <SearchFilterSections
        layout="expanded"
        desktopGroup="basis"
        value={defaultAdvancedSearchValue()}
        setValue={() => {}}
        categories={categories}
        section="categories"
      />,
    );

    const trigger = getByRole("button", { name: /Kategori/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(getByText("kategorivelger")).toBeTruthy();

    fireEvent.click(trigger);
    expect(queryByText("kategorivelger")).toBeNull();
  });

  it("shows the selected value and opens the concrete primary filter", () => {
    const { getByText, queryByText } = setup("price");

    fireEvent.click(screen.getByRole("button", { name: "Tilbake til filteroversikt" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Tilbake til filteroversikt" }));

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
    const { getAllByRole } = render(
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

    fireEvent.click(screen.getByRole("button", { name: "Tilbake til filteroversikt" }));
    const names = getAllByRole("button").map((button) => button.textContent ?? "");
    expect(names.findIndex((name) => name.includes("Karosseri"))).toBeLessThan(
      names.findIndex((name) => name.includes("Drivstoff")),
    );
  });
});

describe("filterlisten på telefon", () => {
  const equipment = (key: string, sort_order: number): CategoryFilter => ({
    ...fuelFilter,
    id: key,
    key,
    label_nb: key,
    type: "multiselect",
    options: Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label_nb: `V${i}` })),
    sort_order,
    is_primary: false,
  });
  const frame: CategoryFilter = {
    ...fuelFilter,
    id: "frame",
    key: "frame",
    label_nb: "Rammestørrelse",
    type: "range",
    options: null,
    is_primary: false,
    sort_order: 5,
  };
  const hp: CategoryFilter = {
    ...frame,
    id: "hp",
    key: "hp",
    label_nb: "Hestekrefter",
    is_primary: true,
    depends_on_key: "fuel",
    depends_on_not_value: "electric",
  };

  it("samler utstyrsgruppene i én rad og viser korte valg som brikker", () => {
    const rows = groupFilterRows([
      fuelFilter,
      equipment("utstyr_lys", 2),
      frame,
      equipment("utstyr_dekk", 3),
    ]);
    expect(rows.map((row) => (row.kind === "inline" ? row.filter.key : row.label))).toEqual([
      "fuel",
      "Utstyr",
      "Rammestørrelse",
    ]);
  });

  function renderWorkspace(values: Record<string, never> | Record<string, unknown> = {}) {
    return render(
      <SearchFilterSections
        layout="workspace"
        value={{ ...defaultAdvancedSearchValue(), categories: ["mobler"] }}
        setValue={() => {}}
        categories={categories}
        section="categories"
        attributeFilters={[fuelFilter, hp, frame]}
        attributeValues={values as never}
        onAttributeChange={() => {}}
        attributeCounts={{ fuel: { electric: 0, diesel: 4 } }}
        categoryNotice={["Farge", "Merke"]}
      />,
    );
  }

  it("viser avhengige filtre først når de gjelder, og fjernede filtre ved navn", () => {
    const hidden = renderWorkspace({ fuel: { kind: "select", value: "electric" } });
    expect(hidden.queryByText("Hestekrefter")).toBeNull();
    expect(hidden.getByRole("status").textContent).toContain("Farge og Merke");
    cleanup();

    const shown = renderWorkspace({ fuel: { kind: "select", value: "diesel" } });
    expect(shown.getByText("Hestekrefter")).toBeTruthy();
  });

  it("gråer ut alternativer uten treff og folder bort tilleggsfiltre", () => {
    const { getByRole, queryByText } = renderWorkspace();
    expect((getByRole("button", { name: /Elektrisk/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(queryByText("Rammestørrelse")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Vis 1 flere filtre" }));
    expect(queryByText("Rammestørrelse")).toBeTruthy();
  });
});
