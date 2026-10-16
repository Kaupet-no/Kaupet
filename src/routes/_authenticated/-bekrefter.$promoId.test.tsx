// @vitest-environment jsdom
import type { ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reconcile: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ promoId: "promo-1" }),
  }),
  useRouter: () => ({ navigate: mocks.navigate }),
  Link: () => null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.reconcile }));
vi.mock("@/lib/promotions.functions", () => ({ reconcilePromotionPayment: vi.fn() }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));

import { Route } from "./bekrefter.$promoId";
const ConfirmPage = (Route as unknown as { options: { component: ComponentType } }).options
  .component;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.reconcile.mockReset().mockRejectedValue(new Error("nettverk"));
  mocks.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// KG-05-F01: «Prøv igjen» etter tidsavbrudd må starte en ny avstemmingsrunde.
it("starter ny avstemming når brukeren trykker Prøv igjen etter 15 feil", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmPage />
    </QueryClientProvider>,
  );
  for (let i = 0; i < 15; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  }
  expect(mocks.reconcile).toHaveBeenCalledTimes(15);
  expect(screen.getByText("Kunne ikke bekrefte akkurat nå")).toBeTruthy();

  mocks.reconcile.mockResolvedValue({ status: "active" });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(mocks.reconcile).toHaveBeenCalledTimes(16);
  expect(mocks.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ to: "/kvittering/$promoId" }),
  );
});
