// @vitest-environment jsdom
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => ({}),
}));
vi.mock("@/lib/vehicle/admin-vehicle-brands.functions", () => ({
  // Merket har bare én modell uten klasse; klassen «Sedan» har ingen modeller.
  adminListVehicleBrandsWithModels: async () => [
    {
      brand_id: "b1",
      brand_name: "Volvo",
      category_group: "bil",
      model_id: "m1",
      model_name: "V70",
      class_id: null,
      class_name: null,
    },
  ],
  adminCreateVehicleBrand: vi.fn(),
  adminUpdateVehicleBrand: vi.fn(),
  adminDeleteVehicleBrand: vi.fn(),
  adminCreateVehicleModel: vi.fn(),
  adminUpdateVehicleModel: vi.fn(),
  adminDeleteVehicleModel: vi.fn(),
  adminCreateVehicleModelClass: vi.fn(),
  adminUpdateVehicleModelClass: vi.fn(),
  adminDeleteVehicleModelClass: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.order = () => query;
      query.range = async () => ({
        data: [{ id: "c1", brand_id: "b1", name: "Sedan" }],
        error: null,
      });
      return query;
    },
  },
}));
vi.mock("@/components/admin/moderasjon/vehicle-brands-tab", () => ({
  VehicleBrandsTab: () => null,
}));

import { Route } from "./kjoretoy";
const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;

afterEach(cleanup);

// KG-11-F02: klasser ble bare funnet via modellene, så en ny klasse var usynlig.
it("viser en ny klasse uten modeller for merket", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Volvo" }));
  expect(await screen.findByText("Sedan")).toBeTruthy();
});
