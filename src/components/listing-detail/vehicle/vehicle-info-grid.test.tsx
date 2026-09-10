// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VehicleInfoGrid } from "./vehicle-info-grid";

afterEach(cleanup);

describe("VehicleInfoGrid", () => {
  it("viser selgerens egne opplysninger når SVV-oppslaget mangler", () => {
    // Annonser opprettet via "Kjøretøyet er ikke registrert" har ingen
    // SVV-snapshot. Selgeren fyller ut de samme feltene manuelt som
    // obligatoriske wizard-felt, og de skal vises på annonsen.
    render(
      <VehicleInfoGrid
        vehicleLookup={null}
        mileageKm={128000}
        driveType="forhjul"
        attributes={{
          fuel_type: "bensin",
          transmission: "manuell",
          power_hk: 99,
          seats: 5,
          color: "silver",
          body_type: "stasjonsvogn",
          next_eu_control: "2027-04-30",
        }}
      />,
    );

    expect(screen.getByText("128 000 km")).toBeTruthy();
    expect(screen.getByText("Bensin")).toBeTruthy();
    expect(screen.getByText("Manuell")).toBeTruthy();
    expect(screen.getByText("Forhjulstrekk")).toBeTruthy();
    expect(screen.getByText("99 hk")).toBeTruthy();
    expect(screen.getByText("5 seter")).toBeTruthy();
    expect(screen.getByText("Sølv")).toBeTruthy();
    expect(screen.getByText("Stasjonsvogn")).toBeTruthy();
  });

  it("lar SVV-oppslaget vinne over selgerens attributter", () => {
    render(
      <VehicleInfoGrid
        vehicleLookup={
          {
            fuel_type: "diesel",
            transmission: "automat",
            color: "Hvit",
            body_type_hint: "Kupé (AD)",
          } as never
        }
        mileageKm={null}
        attributes={{ fuel_type: "bensin", transmission: "manuell", color: "silver" }}
      />,
    );

    expect(screen.getByText("Diesel")).toBeTruthy();
    expect(screen.getByText("Automat")).toBeTruthy();
    expect(screen.getByText("Hvit")).toBeTruthy();
    expect(screen.getByText("Kupé (AD)")).toBeTruthy();
    expect(screen.queryByText("Bensin")).toBeNull();
  });

  it("skjuler rutenettet helt når verken oppslag eller attributter har data", () => {
    const { container } = render(
      <VehicleInfoGrid vehicleLookup={null} mileageKm={null} attributes={{}} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
