// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { VehicleRegistration } from ".";

vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: () => <div>Tekniske opplysninger</div>,
  useAllCategoryFilters: () => ({ data: [] }),
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

afterEach(cleanup);

describe("VehicleRegistration", () => {
  it("viser registrert bil som solo oppslag og samler SVV-fakta med korreksjonen", () => {
    const { rerender } = render(<VehicleRegistration {...props({})} />);

    expect(screen.getByLabelText(/Registreringsnummer/)).toBeTruthy();
    expect(screen.queryByText(/^Merke:/)).toBeNull();
    expect(screen.queryByText(/^Modell:/)).toBeNull();
    expect(screen.queryByText("Tekniske opplysninger")).toBeNull();

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
    expect((screen.getByRole("button", { name: "Ja" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("beholder merke, modell og tekniske opplysninger for uregistrert kjøretøy", () => {
    render(<VehicleRegistration {...props({ vehicleRegistered: false })} />);

    expect(screen.getByText("Merke: tomt")).toBeTruthy();
    expect(screen.getByText("Modell: tomt")).toBeTruthy();
    expect(screen.getByText("Tekniske opplysninger")).toBeTruthy();
    expect(screen.queryByLabelText("Registreringsnummer")).toBeNull();
  });
});
