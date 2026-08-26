// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartFitmentField } from "./part-fitment-fields";

vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => ({
    data: [{ id: "brand-1", name: "Volvo", category_group: "bil" }],
  }),
  useAllVehicleModels: () => ({
    data: [{ id: "model-1", brand_id: "brand-1", name: "V70", class_id: null }],
  }),
}));

afterEach(cleanup);

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
});
