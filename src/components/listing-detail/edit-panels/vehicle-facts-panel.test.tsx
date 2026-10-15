// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VehicleFactsPanel } from "./vehicle-facts-panel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each([
  [null, 2],
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
