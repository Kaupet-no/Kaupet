// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import type { WizardSharedProps } from "../types";
import { VehicleFactsGroup } from ".";

const categoryFilters = vi.hoisted(() => ({ current: [] as CategoryFilter[] }));

vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: ({
    filterKeys,
    heading,
  }: {
    filterKeys?: readonly string[];
    heading?: string | null;
  }) => (
    <div
      data-testid="technical-attributes"
      data-filter-keys={filterKeys?.join(",") ?? ""}
      data-heading={heading ?? ""}
    />
  ),
  useAllCategoryFilters: () => ({ data: categoryFilters.current }),
}));

vi.mock("@/components/ui/input", () => ({ Input: () => <input /> }));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => null,
}));
vi.mock("../title-photos", () => ({ VehicleTitleFields: () => null }));
vi.mock("../description-keywords", () => ({
  DescriptionField: () => null,
  KeywordChips: () => null,
}));

const category = {
  id: "bil",
  parent_id: "bil-og-mc",
  name_nb: "Bil",
  slug: "bil",
  icon: null,
  color: null,
};

function requiredFilter(key: string): CategoryFilter {
  return {
    id: key,
    category_id: category.id,
    key,
    label_nb: key,
    type: "text",
    unit: null,
    options: null,
    sort_order: 0,
    is_primary: false,
    depends_on_key: null,
    depends_on_value: null,
    depends_on_not_value: null,
    is_optional: false,
  };
}

function props(overrides: Partial<WizardSharedProps> = {}): WizardSharedProps {
  return {
    categories: [category],
    categoryId: category.id,
    attributes: {},
    onAttributesChange: vi.fn(),
    attributesTouched: false,
    vehicleRegistered: true,
    vehicleLookupResult: {} as WizardSharedProps["vehicleLookupResult"],
    showMileage: false,
    register: vi.fn(() => ({})),
    errors: {},
    subtitle: "",
    ...overrides,
  } as unknown as WizardSharedProps;
}

afterEach(() => {
  cleanup();
  categoryFilters.current = [];
});

describe("VehicleFactsGroup", () => {
  it("viser påkrevde SVV-felt som mangler på siden Gjør søkbar", () => {
    categoryFilters.current = [requiredFilter("fuel_type")];

    render(<VehicleFactsGroup {...props()} />);
    const technicalFields = screen.getByTestId("technical-attributes");
    expect(technicalFields.getAttribute("data-filter-keys")).toBe("fuel_type");
    expect(technicalFields.getAttribute("data-heading")).toBe("Tekniske opplysninger");
  });

  it("viser ikke SVV-felt på nytt når oppslaget allerede har fylt det ut", () => {
    categoryFilters.current = [requiredFilter("fuel_type")];

    render(<VehicleFactsGroup {...props({ attributes: { fuel_type: "bensin" } })} />);

    expect(screen.queryByTestId("technical-attributes")).toBeNull();
  });

  it("viser sylindre og motorkode som valgfrie selv når SVV ikke har data", () => {
    categoryFilters.current = [requiredFilter("cylinders"), requiredFilter("engine_code")];

    render(<VehicleFactsGroup {...props()} />);
    const technicalFields = screen.getAllByTestId("technical-attributes");

    expect(technicalFields).toHaveLength(1);
    expect(technicalFields[0].getAttribute("data-filter-keys")).toBe("cylinders,engine_code");
    expect(technicalFields[0].getAttribute("data-heading")).toBe(
      "Flere tekniske opplysninger (valgfritt)",
    );
  });
});
