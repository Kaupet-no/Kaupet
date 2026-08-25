// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import { VehicleRegistration } from ".";

const categoryFilters = vi.hoisted(() => ({ current: [] as CategoryFilter[] }));

vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: ({ required }: { required?: boolean }) => (
    <div data-testid="attribute-fields" data-required={required ? "true" : "false"} />
  ),
  useAllCategoryFilters: () => ({ data: categoryFilters.current }),
}));

vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => ({ data: [] }),
  useAllVehicleModels: () => ({ data: [] }),
}));

vi.mock(
  "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields",
  () => ({
    VehicleBrandField: ({ value }: { value?: string }) => <div>Merke: {value ?? "tomt"}</div>,
    VehicleModelWithClassField: ({ value }: { value?: string }) => (
      <div>Modell: {value ?? "tomt"}</div>
    ),
  }),
);

const category = {
  id: "bil",
  parent_id: "bil-og-mc",
  name_nb: "Bil",
  slug: "bil",
  icon: null,
  color: null,
};

const lookup = {
  registrationNumber: "EK12345",
  brand: "Toyota",
  model: "Corolla",
  year: 2020,
  color: "Blå",
} as WizardSharedProps["vehicleLookupResult"];

function props(overrides: Partial<WizardSharedProps>): WizardSharedProps {
  return {
    categories: [category],
    categoryId: category.id,
    title: "Toyota Corolla",
    vehicleRegistered: true,
    setVehicleRegistered: vi.fn(),
    vehicleLookupLoading: false,
    vehicleLookupError: null,
    vehicleRegNrInput: "",
    setVehicleRegNrInput: vi.fn(),
    attributes: {},
    onAttributesChange: vi.fn(),
    attributesTouched: false,
    extraFieldError: null,
    bilOgMcCategoryId: "bil-og-mc",
    onCategorySelect: vi.fn(),
    vehicleLookupResult: null,
    vehicleClassification: null,
    vehiclePreviousClassificationMismatch: null,
    confirmVehicleData: vi.fn(),
    resetLookupOnReturnToRegistration: vi.fn(),
    ...overrides,
  } as unknown as WizardSharedProps;
}

afterEach(() => {
  cleanup();
  categoryFilters.current = [];
});

function requiredTextFilter(key: string): CategoryFilter {
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

describe("VehicleRegistration", () => {
  it("viser registrert bil som solo oppslag og samler SVV-fakta med korreksjonen", () => {
    const { rerender } = render(<VehicleRegistration {...props({})} />);

    expect(screen.getByLabelText(/Registreringsnummer/)).toBeTruthy();
    expect(screen.queryByText(/^Merke:/)).toBeNull();
    expect(screen.queryByText(/^Modell:/)).toBeNull();
    expect(screen.queryByTestId("attribute-fields")).toBeNull();

    rerender(
      <VehicleRegistration
        {...props({
          vehicleLookupResult: lookup,
          vehicleClassification: { slug: "bil", confidence: "high" },
        })}
      />,
    );

    expect(screen.getByText("Merke: Toyota")).toBeTruthy();
    expect(screen.getByText("Modell: Corolla")).toBeTruthy();
    expect(screen.getByText("Kjøretøydata fra Statens vegvesen")).toBeTruthy();
    expect(
      screen.getByText(/Hvis registreringsnummeret eller underkategorien er feil/),
    ).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ja" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("viser registreringsfrie kjøretøy med kun grunnfakta åpen først", () => {
    render(<VehicleRegistration {...props({ vehicleRegistered: false })} />);

    expect(screen.getByText("Grunnfakta")).toBeTruthy();
    expect(screen.getByText("Drivlinje")).toBeTruthy();
    expect(screen.getByText("Praktiske opplysninger")).toBeTruthy();
    expect(screen.getByText("Flere opplysninger")).toBeTruthy();
    const details = [...document.querySelectorAll("details")];
    expect(details).toHaveLength(4);
    expect(details.every((section) => section.querySelector("summary"))).toBe(true);
    expect(details.map((section) => section.open)).toEqual([true, false, false, false]);
    const fields = screen.getAllByTestId("attribute-fields");
    expect(fields).toHaveLength(4);
    expect(fields.every((field) => field.dataset.required === "true")).toBe(true);
    expect(screen.getByText("Merke: tomt")).toBeTruthy();
    expect(screen.getByText("Modell: tomt")).toBeTruthy();
    expect(screen.queryByLabelText("Registreringsnummer")).toBeNull();
  });

  it("åpner og markerer en seksjon med manglende felt etter validering", () => {
    categoryFilters.current = [requiredTextFilter("fuel_type")];

    render(
      <VehicleRegistration {...props({ vehicleRegistered: false, attributesTouched: true })} />,
    );

    const section = screen.getByText("Drivlinje").closest("details");
    expect(section?.open).toBe(true);
    expect(screen.getByText("Mangler påkrevde opplysninger")).toBeTruthy();
    expect(screen.getByText("Drivlinje").closest("summary")?.getAttribute("aria-describedby")).toBe(
      "vehicle-manual-drivlinje-heading-error",
    );
  });
});
