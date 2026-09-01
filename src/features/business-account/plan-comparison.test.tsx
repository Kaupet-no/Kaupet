// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setBusinessPlanMock = vi.fn();
vi.mock("@/lib/business.functions", () => ({
  setBusinessPlan: (...args: unknown[]) => setBusinessPlanMock(...args),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

import { PlanComparison } from "./plan-comparison";
import { BUSINESS_PLANS, hasEffectiveProffAccess } from "./plans";

function renderPlans(organization: Parameters<typeof PlanComparison>[0]["organization"] = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanComparison organization={organization} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => setBusinessPlanMock.mockReset().mockResolvedValue({ organization: {} }));

describe("business plan comparison", () => {
  it("keeps the exact prices and feature decision table in one data source", () => {
    expect(BUSINESS_PLANS.proff_basis.monthlyPriceNok).toBe(0);
    expect(BUSINESS_PLANS.proff.monthlyPriceNok).toBe(1490);
    expect(BUSINESS_PLANS.proff.trialText).toBe("30 dager gratis, deretter 1 490 kr per måned");

    const labels = [
      "Opprette ubegrenset antall annonser i alle kategorier",
      "Sende og motta meldinger",
      "Opprette søk og varsler",
      "Informasjon om bedriften på egne annonser",
      "Brukerkontoer",
      "Egen branding på annonser",
      "Andre annonser fra bedriften vises i egne annonser",
      "Nettsidelenke på egne annonser",
      "Masseopprettelse med Excel/CSV",
      "API-integrasjon",
      "Prioritert support",
    ];
    expect(BUSINESS_PLANS.proff_basis.features.map(({ label }) => label)).toEqual(labels);
    expect(BUSINESS_PLANS.proff.features.map(({ label }) => label)).toEqual(labels);
    expect(BUSINESS_PLANS.proff_basis.features.map(({ included }) => included)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(BUSINESS_PLANS.proff.features.map(({ included }) => included)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("renders a semantic desktop table and stacked mobile cards without hiding feature meaning", () => {
    renderPlans();
    expect(
      screen.getByRole("table", { name: "Sammenligning av Proff basis og Proff" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Gratis – alltid").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1.?490 kr per måned/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("Ikke inkludert: Egen branding på annonser").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Kommer senere", { exact: false }).length).toBeGreaterThan(0);
  });

  it("disables Proff after an expired or cancelled trial but keeps it selectable while active", () => {
    const expired = {
      selected_plan: "proff_basis",
      proff_access_until: "2026-08-31T00:00:00.000Z",
      proff_trial_started_at: "2026-08-01T00:00:00.000Z",
      proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
      proff_trial_cancelled_at: "2026-08-15T00:00:00.000Z",
    } as const;
    renderPlans(expired);
    expect(screen.getByRole("status").textContent).toContain("Prøveperioden er brukt");
    expect(
      screen
        .getAllByRole("button", { name: "Prøveperioden er brukt" })
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(hasEffectiveProffAccess(expired, Date.parse("2026-09-01T00:00:00.000Z"))).toBe(false);

    cleanup();
    const active = {
      selected_plan: "proff",
      proff_access_until: "2026-09-30T00:00:00.000Z",
      proff_trial_started_at: "2026-09-01T00:00:00.000Z",
      proff_trial_ends_at: "2026-10-01T00:00:00.000Z",
      proff_trial_cancelled_at: null,
    } as const;
    renderPlans(active);
    expect(screen.getAllByRole("button", { name: "Valgt" }).length).toBeGreaterThan(0);
    expect(hasEffectiveProffAccess(active, Date.parse("2026-09-15T00:00:00.000Z"))).toBe(true);
  });

  it("shows loading and success states for a plan submission", async () => {
    let resolve!: (value: { organization: object }) => void;
    const promise = new Promise<{ organization: object }>((resolver) => {
      resolve = resolver;
    });
    setBusinessPlanMock.mockReturnValueOnce(promise);
    renderPlans();
    fireEvent.click(screen.getAllByRole("button", { name: "Start 30 dagers prøveperiode" })[0]!);

    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toContain("Lagrer valgt plan");
    expect(setBusinessPlanMock).toHaveBeenCalledWith({ data: { plan: "proff" } });
    resolve({ organization: {} });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Planen er lagret."),
    );
  });
});
