// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartFitmentSummary } from "./part-fitment-summary";

vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => ({
    data: [{ id: "brand-1", name: "Volvo", category_group: "bil" }],
  }),
  useAllVehicleModels: () => ({
    data: [{ id: "model-1", brand_id: "brand-1", name: "V70", class_id: null }],
  }),
}));

afterEach(cleanup);

describe("PartFitmentSummary", () => {
  it("viser selgeroppgitte modeller, årsintervall og kilde", () => {
    render(
      <PartFitmentSummary
        attributes={{
          part_fitment_scope: "specific",
          part_fitment_vehicle_ids: ["model-1"],
          part_fitment_year_from: 2010,
          part_fitment_year_to: 2016,
          part_brand: "Brembo",
          part_number: "123-ABC",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Passer til" })).toBeTruthy();
    expect(screen.getByText("Volvo V70")).toBeTruthy();
    expect(screen.getByText("Årsmodell 2010–2016")).toBeTruthy();
    expect(screen.getByText("Brembo")).toBeTruthy();
    expect(screen.getByText("123-ABC")).toBeTruthy();
    expect(screen.getByText(/opplysninger gitt av selger/)).toBeTruthy();
  });
});
