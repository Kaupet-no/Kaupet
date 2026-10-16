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

  it("rendrer datoattributter som datovelger, aldri fritekst", () => {
    filters.current = [
      { ...textFilter, key: "next_eu_control", label_nb: "Neste EU-kontroll", type: "date" },
    ];
    const onChange = vi.fn();
    render(
      <AttributeFields
        categoryId="category-1"
        categories={[{ id: "category-1", parent_id: null }]}
        value={{ next_eu_control: "31.12" }}
        onChange={onChange}
        required
        showErrors
      />,
    );

    const input = screen.getByLabelText("Neste EU-kontroll *") as HTMLInputElement;
    expect(input.type).toBe("date");
    // Et gammelt, ugyldig utkast vises som tomt felt i stedet for å vises videre.
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "2027-05-31" } });
    expect(onChange).toHaveBeenCalledWith({ next_eu_control: "2027-05-31" });
  });

  it("viser Mangler/Fritatt som brytere når fristen er passert, og fjerner dem ved ny dato", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    const date = {
      ...textFilter,
      key: "next_eu_control",
      label_nb: "Neste EU-kontroll",
      type: "date" as const,
    };
    const status: CategoryFilter = {
      ...selectFilter(0),
      id: "filter-eu-status",
      key: "eu_control_status",
      label_nb: "EU-kontrollstatus",
      sort_order: 2,
      depends_on_key: "next_eu_control",
      options: [
        { value: "missing", label_nb: "Mangler EU-kontroll" },
        { value: "exempt", label_nb: "Fritatt for EU-kontroll" },
      ],
    };
    filters.current = [date, status];
    const onChange = vi.fn();
    const props = {
      categoryId: "category-1",
      categories: [{ id: "category-1", parent_id: null }],
      onChange,
      required: true,
      showErrors: true,
      // Kun datoen er valgt ut; alternativene følger med.
      filterKeys: ["next_eu_control"],
    };
    const { rerender } = render(
      <AttributeFields {...props} value={{ next_eu_control: "2026-01-31" }} />,
    );

    const input = screen.getByLabelText("Neste EU-kontroll *") as HTMLInputElement;
    expect(input.min).toBe("2026-10-15");
    expect(screen.getByText(/Datoen er passert/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Mangler EU-kontroll" }));
    expect(onChange).toHaveBeenLastCalledWith({
      next_eu_control: "2026-01-31",
      eu_control_status: "missing",
    });

    rerender(
      <AttributeFields
        {...props}
        value={{ next_eu_control: "2026-01-31", eu_control_status: "missing" }}
      />,
    );
    expect(screen.queryByText(/Datoen er passert/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Neste EU-kontroll/), {
      target: { value: "2027-05-31" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ next_eu_control: "2027-05-31" });

    rerender(<AttributeFields {...props} value={{ next_eu_control: "2027-05-31" }} />);
    expect(screen.queryByRole("switch")).toBeNull();
    vi.useRealTimers();
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
