// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upcoming: vi.fn(), orders: vi.fn(), locations: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/admin-proff.functions", () => ({
  adminListProffUpcomingInvoices: mocks.upcoming,
  adminListProffOrders: mocks.orders,
  adminListLocationCharges: mocks.locations,
  adminCancelProffOrder: vi.fn(),
  adminEndProffAgreement: vi.fn(),
  adminMarkLocationChargeInvoiced: vi.fn(),
  adminMarkProffOrderPaid: vi.fn(),
  adminRegisterProffInvoiceSent: vi.fn(),
  adminRegisterProffReminder: vi.fn(),
}));
vi.mock("@/hooks/use-admin-events", () => ({ invalidateAdminEvents: vi.fn() }));
import { Route } from "./proff-abonnement";

function renderPage() {
  const Component = Route.options.component!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  mocks.upcoming.mockReset().mockResolvedValue([]);
  mocks.orders.mockReset().mockResolvedValue([]);
  mocks.locations.mockReset().mockResolvedValue([]);
});
describe("Proff-fakturering: lasting og feil", () => {
  it("viser lasting før fakturaene er hentet", () => {
    mocks.upcoming.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Laster fakturaer som skal sendes…")).toBeTruthy();
    expect(screen.queryByText("Ingen fakturaer å sende")).toBeNull();
  });
  it.each([
    ["upcoming", "Kunne ikke hente fakturaer som skal sendes.", "Ingen fakturaer å sende"],
    ["orders", "Kunne ikke hente fakturaer.", "Ingen fakturaer med denne statusen"],
    ["locations", "Kunne ikke hente lokasjonsperioder.", "Ingen lokasjonsperioder til fakturering"],
  ] as const)("viser feil og lar admin prøve %s på nytt", async (key, error, empty) => {
    mocks[key].mockRejectedValueOnce(new Error("Database unavailable")).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.queryByText(empty)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(await screen.findByText(empty)).toBeTruthy();
    expect(screen.queryByText(error)).toBeNull();
  });
});
