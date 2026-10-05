// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("./-admin-chart", () => ({ AdminViewsChart: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: [], error: null }),
    from: () => {
      let limit = 0;
      const query = {
        select: () => query,
        is: () => query,
        order: () => query,
        limit: (value: number) => {
          limit = value;
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          mocks.events(limit).then(resolve, reject),
      };
      return query;
    },
  },
}));

import { Route as DashboardRoute } from "./index";
import { Route as EventsRoute } from "./hendelser";
import { invalidateAdminEvents } from "@/hooks/use-admin-events";

const rows = Array.from({ length: 120 }, (_, i) => ({
  id: String(i),
  kind: "listing_reported",
  title: `Rapport ${i}`,
  created_at: "2026-10-05T10:00:00Z",
  handled_at: null,
}));
const clients: QueryClient[] = [];

function client() {
  const result = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  clients.push(result);
  return result;
}

function renderPage(queryClient: QueryClient, page: "oversikt" | "hendelser" = "oversikt") {
  const Component = (page === "oversikt" ? DashboardRoute : EventsRoute).options.component!;
  return render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.events.mockReset().mockImplementation(async (limit: number) => ({
    data: rows.slice(0, limit),
    error: null,
  }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((queryClient) => queryClient.clear());
});

describe("Adminoversikt: cache og hentetilstander (tilstandsovergang)", () => {
  it.each(["oversikt", "hendelser"] as const)(
    "beholder oversiktens telling og listens grense når %s besøkes først",
    async (first) => {
      const queryClient = client();
      for (const page of [first, first === "oversikt" ? "hendelser" : "oversikt"] as const) {
        const view = renderPage(queryClient, page);
        if (page === "oversikt") {
          expect(await screen.findByText("120 åpne")).toBeTruthy();
        } else {
          await waitFor(() => expect(screen.getAllByText(/^Rapport \d+$/)).toHaveLength(100));
        }
        view.unmount();
      }
      renderPage(queryClient);
      expect(await screen.findByText("120 åpne")).toBeTruthy();
      mocks.events.mockResolvedValue({ data: rows.slice(0, 119), error: null });
      await act(async () => invalidateAdminEvents(queryClient));
      expect(await screen.findByText("119 åpne")).toBeTruthy();
    },
  );

  it("viser ukjent telling under lasting og tomt resultat først etter vellykket henting", async () => {
    let resolve!: (value: { data: never[]; error: null }) => void;
    mocks.events.mockReturnValue(new Promise((done) => (resolve = done)));
    renderPage(client());
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("Ingen åpne")).toBeNull();
    await act(async () => resolve({ data: [], error: null }));
    expect(await screen.findAllByText("Ingen åpne")).toHaveLength(4);
  });

  it("viser feil uten falsk nulltelling og lar admin prøve igjen", async () => {
    mocks.events
      .mockResolvedValueOnce({ data: null, error: new Error("Database unavailable") })
      .mockResolvedValue({ data: [], error: null });
    renderPage(client());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Kunne ikke hente åpne hendelser.",
    );
    expect(screen.queryByText("Ingen åpne")).toBeNull();
    const retry = screen.getByRole("button", { name: "Prøv igjen" });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    await act(async () => retry.click());
    expect(await screen.findAllByText("Ingen åpne")).toHaveLength(4);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("beholder forrige telling og varsler om utdaterte tall ved mislykket oppdatering", async () => {
    const queryClient = client();
    renderPage(queryClient);
    expect(await screen.findByText("120 åpne")).toBeTruthy();
    mocks.events.mockResolvedValue({ data: null, error: new Error("Database unavailable") });
    await act(async () => invalidateAdminEvents(queryClient));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Viste tall kan være utdaterte.",
    );
    expect(screen.getByText("120 åpne")).toBeTruthy();
  });
});
