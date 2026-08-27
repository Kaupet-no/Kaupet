// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartFitmentField, PartVehicleSearchField } from "./part-fitment-fields";

vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => ({
    data: [
      { id: "brand-1", name: "Volvo", category_group: "bil" },
      { id: "brand-2", name: "Honda", category_group: "motorsykkel" },
    ],
  }),
  useAllVehicleModels: () => ({
    data: [
      { id: "model-1", brand_id: "brand-1", name: "V70", class_id: null },
      { id: "model-2", brand_id: "brand-1", name: "XC60", class_id: null },
      { id: "model-3", brand_id: "brand-2", name: "CBR", class_id: null },
    ],
  }),
  useAllVehicleModelClasses: () => ({ data: [] }),
}));
afterEach(cleanup);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = () => {};

describe("PartFitmentField", () => {
  it("viser valgte modeller og årsintervall for en bestemt del", () => {
    render(
      <PartFitmentField
        value={{
          part_fitment_scope: "specific",
          part_fitment_vehicle_ids: ["model-1"],
          part_fitment_year_from: 2010,
          part_fitment_year_to: 2016,
        }}
        onChange={() => {}}
        required
      />,
    );

    expect(screen.getByText("Volvo V70")).toBeTruthy();
    expect(screen.getByLabelText("Årsmodell fra (valgfritt)")).toHaveProperty("value", "2010");
    expect(screen.getByLabelText("Årsmodell til (valgfritt)")).toHaveProperty("value", "2016");
  });

  it("søker modell etter at kjøretøytype og merke er valgt", () => {
    render(<PartVehicleSearchField value={undefined} onChange={() => {}} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Merke" }));
    fireEvent.click(screen.getByRole("option", { name: "Volvo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Bilmodell" }));

    const search = screen.getByPlaceholderText("Søk modell…");
    expect(screen.getByText("V70")).toBeTruthy();
    expect(screen.getByText("XC60")).toBeTruthy();

    fireEvent.change(search, { target: { value: "XC" } });

    expect(screen.queryByText("V70")).toBeNull();
    expect(screen.getByText("XC60")).toBeTruthy();
  });

  it("viser samme søkbare menyinnhold når feltet ligger i en åpen filtermeny", () => {
    render(<PartVehicleSearchField value={undefined} onChange={() => {}} contentOnly />);

    expect(screen.getByPlaceholderText("Søk modell…")).toBeTruthy();
  });

  it("kan velge alle modeller for et merke", () => {
    const onChange = vi.fn();
    render(<PartVehicleSearchField value={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Merke" }));
    fireEvent.click(screen.getByRole("option", { name: "Volvo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Bilmodell" }));
    fireEvent.click(screen.getByRole("option", { name: "Volvo (alle)" }));

    expect(onChange).toHaveBeenCalledWith({
      kind: "multiselect",
      values: ["model-1", "model-2"],
    });
  });

  it("tilbyr merker og modeller for andre kjøretøygrupper", () => {
    render(<PartVehicleSearchField value={undefined} onChange={() => {}} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Kjøretøytype" }));
    fireEvent.click(screen.getByRole("option", { name: "Motorsykkel" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Merke" }));
    fireEvent.click(screen.getByRole("option", { name: "Honda" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Bilmodell" }));

    expect(screen.getByText("CBR")).toBeTruthy();
  });

  it("lar selgeren knytte delen til alle modeller av et merke", () => {
    const onChange = vi.fn();
    render(<PartFitmentField value={{ part_fitment_scope: "specific" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Merke" }));
    fireEvent.click(screen.getByRole("option", { name: "Volvo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Bilmodell" }));
    fireEvent.click(screen.getByRole("option", { name: "Volvo (alle)" }));

    expect(onChange).toHaveBeenCalledWith({
      part_fitment_scope: "specific",
      part_fitment_vehicle_ids: ["model-1", "model-2"],
    });
  });

  it("viser feil når årsmodellintervallet er snudd", () => {
    render(
      <PartFitmentField
        value={{
          part_fitment_scope: "specific",
          part_fitment_vehicle_ids: ["model-1"],
          part_fitment_year_from: 2018,
          part_fitment_year_to: 2010,
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Årsmodell fra kan ikke være høyere enn årsmodell til.")).toBeTruthy();
  });
});
