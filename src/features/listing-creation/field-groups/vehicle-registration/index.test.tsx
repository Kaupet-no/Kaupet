// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import { VehicleRegistration } from ".";

const categoryFilters = vi.hoisted(() => ({ current: [] as CategoryFilter[] }));

vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: ({
    required,
    filterKeys,
  }: {
    required?: boolean;
    filterKeys?: readonly string[];
  }) => (
    <div
      data-testid="attribute-fields"
      data-required={required ? "true" : "false"}
      data-filter-keys={filterKeys?.join(",") ?? ""}
    />
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
    runVehicleLookup: vi.fn(),
    setValue: vi.fn(),
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
  it("slår opp skiltet med Bekreft og viser kjøretøyet i en melding under skiltet", () => {
    const runVehicleLookup = vi.fn();
    const { rerender } = render(
      <VehicleRegistration {...props({ vehicleRegNrInput: "EK12345", runVehicleLookup })} />,
    );

    expect(screen.queryByRole("radiogroup", { name: "Underkategori" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bekreft" }));
    expect(runVehicleLookup).toHaveBeenCalledWith("EK12345");

    rerender(
      <VehicleRegistration
        {...props({
          vehicleRegNrInput: "EK12345",
          vehicleLookupResult: lookup,
          vehicleClassification: { slug: "bil", confidence: "high" },
        })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Dette registreringsnummeret tilhører en 2020 blå Toyota Corolla. Annonsen blir opprettet i underkategori Bil.",
    );
    expect(screen.queryByLabelText(/Kjøretøyet er ikke registrert/)).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/^Merke:/)).toBeNull();

    expect(screen.queryByRole("radiogroup", { name: "Underkategori" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Endre underkategori" }));
    expect(screen.getByRole("radiogroup", { name: "Underkategori" })).toBeTruthy();
  });

  it("setter tittelen fra SVV-oppslaget", () => {
    const setValue = vi.fn();
    render(<VehicleRegistration {...props({ vehicleLookupResult: lookup, setValue })} />);

    expect(setValue).toHaveBeenCalledWith("title", "2020 Toyota Corolla", {
      shouldValidate: true,
    });
  });

  it("ber om merke og modell når oppslaget mangler dem", () => {
    render(
      <VehicleRegistration
        {...props({ vehicleLookupResult: { ...lookup!, brand: null, model: null } })}
      />,
    );

    expect(screen.getByText(/^Merke:/)).toBeTruthy();
    expect(screen.getByText(/^Modell:/)).toBeTruthy();
    expect(screen.queryAllByTestId("attribute-fields")).toHaveLength(0);
  });

  it("deaktiverer skilt og Bekreft og viser underkategorien for uregistrerte kjøretøy", () => {
    render(<VehicleRegistration {...props({ vehicleRegistered: false })} />);

    expect((screen.getByLabelText(/Registreringsnummer/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Bekreft" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("radiogroup", { name: "Underkategori" })).toBeTruthy();
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
    // DOM-rekkefølge: registreringsnummer-blokken (Drivlinje/Praktiske/Flere)
    // står først, deretter underkategori, så de manuelle feltene med Grunnfakta.
    expect(details.map((section) => section.open)).toEqual([false, false, false, true]);
    const fields = screen.getAllByTestId("attribute-fields");
    expect(fields).toHaveLength(4);
    expect(fields.every((field) => field.dataset.required === "true")).toBe(true);
    expect(screen.getByText("Merke: tomt")).toBeTruthy();
    expect(screen.getByText("Modell: tomt")).toBeTruthy();
    expect((screen.getByLabelText("Registreringsnummer") as HTMLInputElement).disabled).toBe(true);
  });

  it("åpner seksjoner med tomme påkrevde felt før brukeren har forsøkt å gå videre", () => {
    // attributesTouched er usann: et påkrevd felt som er tomt skal likevel
    // ikke ligge bak en lukket seksjon.
    categoryFilters.current = [requiredTextFilter("seats")];

    render(
      <VehicleRegistration {...props({ vehicleRegistered: false, attributesTouched: false })} />,
    );

    const openHeadings = [...document.querySelectorAll("details")]
      .filter((section) => section.open)
      .map((section) => section.querySelector("summary")?.textContent ?? "");

    expect(openHeadings.some((heading) => heading.includes("Praktiske opplysninger"))).toBe(true);
    // Feilmarkeringen venter fortsatt på et forsøk.
    expect(screen.queryByText("Mangler påkrevde opplysninger")).toBeNull();
  });

  it("gjør sylindre, slagvolum og motorkode valgfrie for manuelle kjøretøy", () => {
    categoryFilters.current = [
      requiredTextFilter("cylinders"),
      requiredTextFilter("engine_displacement_cc"),
      requiredTextFilter("engine_code"),
    ];

    render(<VehicleRegistration {...props({ vehicleRegistered: false })} />);

    const optionalFields = screen
      .getAllByTestId("attribute-fields")
      .filter((field) => field.dataset.required === "false");
    expect(optionalFields).toHaveLength(1);
    expect(optionalFields[0].dataset.filterKeys).toBe(
      "cylinders,engine_displacement_cc,engine_code",
    );
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
