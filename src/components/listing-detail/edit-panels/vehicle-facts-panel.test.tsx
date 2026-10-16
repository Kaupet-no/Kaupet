// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VehicleFactsPanel } from "./vehicle-facts-panel";

const saveField = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/features/listing-edit/edit-mode-context", () => ({
  useListingEdit: () => ({ saveField }),
}));

afterEach(() => {
  saveField.mockClear();
  cleanup();
  vi.useRealTimers();
});

it.each([
  [null, 2],
  ["31.12.2027", 2],
  ["2027-02-30", 2],
  ["2026-10-14", 2],
  ["2026-10-15", 0],
  ["2027-05-31", 0],
])(
  "tilbyr bare alternativ EU-status når fristen %s er tom eller passert (grenseverdier)",
  (nextEuControl, count) => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    render(
      <VehicleFactsPanel
        mileageKm={1000}
        driveType={null}
        euControlStatus={null}
        nextEuControl={nextEuControl}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("switch")).toHaveLength(count);
  },
);

it("beholder EU-fritak når kilometerstand lagres med en eldre datostreng", async () => {
  render(
    <VehicleFactsPanel
      mileageKm={1000}
      driveType={null}
      euControlStatus="exempt"
      nextEuControl="31.12.2027"
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Kilometerstand"), { target: { value: "2000" } });
  fireEvent.click(screen.getByRole("button", { name: "Lagre" }));
  await waitFor(() =>
    expect(saveField).toHaveBeenCalledWith({
      group: "attributes",
      attributes: { mileage_km: 2000, eu_control_status: "exempt" },
      removedKeys: ["drive_type"],
    }),
  );
});
