// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setBusinessPlanMock = vi.fn();
const getOpenProffOrderMock = vi.fn();
const requestProffSubscriptionMock = vi.fn();
const getBusinessOrganizationMock = vi.fn();
vi.mock("@/lib/business/plans.functions", () => ({
  setBusinessPlan: (...args: unknown[]) => setBusinessPlanMock(...args),
  getOpenProffOrder: (...args: unknown[]) => getOpenProffOrderMock(...args),
  requestProffSubscription: (...args: unknown[]) => requestProffSubscriptionMock(...args),
}));
vi.mock("@/lib/business/organization.functions", () => ({
  getBusinessOrganization: (...args: unknown[]) => getBusinessOrganizationMock(...args),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

import { PlanComparison } from "./plan-comparison";
import {
  BUSINESS_PLANS,
  PROFF_TERMS,
  hasEffectiveProffAccess,
  proffTermMonthlyExVatNok,
} from "./plans";

function renderPlans(organization: Parameters<typeof PlanComparison>[0]["organization"] = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanComparison organization={organization} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  setBusinessPlanMock.mockReset().mockResolvedValue({ organization: {} });
  getBusinessOrganizationMock.mockReset().mockResolvedValue({
    billingProfile: {
      billing_email: "faktura@example.com",
      address_line: null,
      postal_code: null,
      city: null,
    },
  });
  getOpenProffOrderMock.mockReset().mockResolvedValue({ order: null });
  requestProffSubscriptionMock.mockReset().mockResolvedValue({ order: {}, alreadyOpen: false });
});

describe("business plan comparison", () => {
  it("keeps the exact prices and feature decisions in one data source", () => {
    expect(BUSINESS_PLANS.proff_basis.monthlyPriceNok).toBe(0);
    expect(BUSINESS_PLANS.proff.monthlyPriceNok).toBe(1490);
    // Prices are ex. VAT, and the yearly term is exactly 12 months minus 10 %.
    expect(PROFF_TERMS.monthly).toMatchObject({ months: 1, priceExVatNok: 1490, discountPct: 0 });
    expect(PROFF_TERMS.yearly).toMatchObject({ months: 12, priceExVatNok: 16092, discountPct: 10 });
    expect(PROFF_TERMS.yearly.priceExVatNok).toBe(
      Math.round(PROFF_TERMS.monthly.priceExVatNok * 12 * 0.9),
    );
    expect(proffTermMonthlyExVatNok("yearly")).toBe(1341);
    expect(BUSINESS_PLANS.proff.trialText).toBe("30 dager gratis prøveperiode");

    const labels = [
      "Opprette ubegrenset antall annonser i alle kategorier",
      "Sende og motta meldinger",
      "Opprette søk og varsler",
      "Informasjon om bedriften på egne annonser",
      "Brukerkontoer",
      "Egen branding på annonser",
      "Andre annonser fra bedriften vises i egne annonser",
      "Nettsidelenke på egne annonser",
      "Opprett flere annonser om gangen med Excel/CSV",
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

  it("renders two accessible comparison cards without hiding feature meaning", () => {
    renderPlans();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "Proff basis" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proff" })).toBeTruthy();
    expect(screen.queryByText("Anbefalt", { exact: true })).toBeNull();
    expect(screen.queryByText("Start enkelt", { exact: true })).toBeNull();
    expect(screen.getAllByText("Proff", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Basis", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alltid gratis").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1.?490 kr per måned eks\. mva/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("Ikke inkludert: Egen branding på annonser").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Kommer senere", { exact: false })).toBeNull();
  });

  it("disables Proff after an expired or cancelled trial but keeps it selectable while active", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-15T00:00:00.000Z"));
    const expired = {
      selected_plan: "proff_basis",
      proff_access_until: "2026-08-31T00:00:00.000Z",
      proff_trial_started_at: "2026-08-01T00:00:00.000Z",
      proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
      proff_trial_cancelled_at: "2026-08-15T00:00:00.000Z",
    } as const;
    renderPlans(expired);
    expect(screen.getByRole("status").textContent).toContain("Prøveperioden er brukt");
    // The expired trial leads to an order instead of a dead end.
    expect(
      screen
        .getAllByRole("button", { name: "Bestill Proff" })
        .every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);
    expect(hasEffectiveProffAccess(expired, Date.parse("2026-09-01T00:00:00.000Z"))).toBe(false);

    cleanup();
    // Evergreen-datoer: komponenten sammenligner mot reell nåtid
    // (hasEffectiveProffAccess med Date.now()), så hardkodede datoer for
    // «aktiv» ble en tidsbombe — testen blei grønn skrevet, men rød idet
    // access_until-datoen passerte (29.→30. sep 2026). +14 dager holder
    // planen aktiv uansett når testen kjører.
    const activeNow = Date.now();
    const active = {
      selected_plan: "proff",
      proff_access_until: new Date(activeNow + 14 * 864e5).toISOString(),
      proff_trial_started_at: new Date(activeNow - 14 * 864e5).toISOString(),
      proff_trial_ends_at: new Date(activeNow + 14 * 864e5).toISOString(),
      proff_trial_cancelled_at: null,
    } as const;
    renderPlans(active);
    expect(screen.getAllByRole("button", { name: "Valgt" }).length).toBeGreaterThan(0);
    expect(hasEffectiveProffAccess(active, activeNow)).toBe(true);
  });

  it("switches the Proff price to the discounted yearly term", async () => {
    renderPlans();
    fireEvent.click(screen.getByLabelText(/Årlig/));
    await waitFor(() =>
      expect(screen.getAllByText(/16.?092 kr per år eks\. mva/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/1.?341 kr per måned eks\. mva/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spar 10 %").length).toBeGreaterThan(0);
  });

  it("orders the selected term with a server-side price after the trial is used", async () => {
    const expired = {
      selected_plan: "proff_basis",
      proff_access_until: "2026-08-31T00:00:00.000Z",
      proff_trial_started_at: "2026-08-01T00:00:00.000Z",
      proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
      proff_trial_cancelled_at: null,
    } as const;
    renderPlans(expired);

    fireEvent.click(screen.getByLabelText(/Årlig/));
    fireEvent.click(screen.getAllByRole("button", { name: "Bestill Proff" })[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Send bestilling" }));

    await waitFor(() =>
      expect(requestProffSubscriptionMock).toHaveBeenCalledWith({
        data: {
          term: "yearly",
          billingReference: undefined,
        },
      }),
    );
    expect(setBusinessPlanMock).not.toHaveBeenCalled();
  });

  it("starter prøveperioden gjennom en bestilling som forklarer første faktura", async () => {
    renderPlans();
    fireEvent.click(screen.getAllByRole("button", { name: "Start 30 dagers prøveperiode" })[0]!);

    expect(await screen.findByText(/Første faktura sendes før prøveperioden utløper/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start prøveperioden" }));

    await waitFor(() =>
      expect(requestProffSubscriptionMock).toHaveBeenCalledWith({
        data: { term: "monthly", billingReference: undefined },
      }),
    );
    expect(setBusinessPlanMock).not.toHaveBeenCalled();
  });

  it("viser utløpsdato, første faktura og opphør ved manglende betaling mens prøven er aktiv", async () => {
    const ends = new Date(Date.now() + 10 * 864e5).toISOString();
    getOpenProffOrderMock.mockResolvedValue({
      order: { id: "o1", term: "yearly", status: "pending", billing_email: "faktura@example.com" },
    });
    renderPlans({
      selected_plan: "proff",
      proff_access_until: ends,
      proff_trial_started_at: new Date().toISOString(),
      proff_trial_ends_at: ends,
      proff_trial_cancelled_at: null,
    });

    expect(await screen.findByText(/Prøveperioden er aktiv til/)).toBeTruthy();
    expect(
      screen.getByText(/Betales den ikke, opphører Proff når prøveperioden er over/),
    ).toBeTruthy();
  });

  it("tilbyr oppsigelse ved periodeslutt og angring for betalt Proff", () => {
    const paid = {
      selected_plan: "proff",
      proff_access_until: new Date(Date.now() + 200 * 864e5).toISOString(),
      proff_trial_started_at: "2026-08-01T00:00:00.000Z",
      proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
      proff_trial_cancelled_at: null,
    } as const;
    renderPlans(paid);
    expect(screen.getAllByRole("button", { name: "Si opp Proff" }).length).toBeGreaterThan(0);
    cleanup();

    renderPlans({ ...paid, proff_subscription_cancelled_at: new Date().toISOString() });
    expect(screen.getAllByRole("button", { name: "Fortsett abonnementet" }).length).toBeGreaterThan(
      0,
    );
    expect(
      (screen.getAllByRole("button", { name: "Sagt opp" })[0] as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows loading and success states for a plan submission", async () => {
    let resolve!: (value: { organization: object }) => void;
    const promise = new Promise<{ organization: object }>((resolver) => {
      resolve = resolver;
    });
    setBusinessPlanMock.mockReturnValueOnce(promise);
    renderPlans();
    fireEvent.click(screen.getAllByRole("button", { name: "Velg Proff basis" })[0]!);

    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toContain("Lagrer valgt plan");
    expect(setBusinessPlanMock).toHaveBeenCalledWith({ data: { plan: "proff_basis" } });
    resolve({ organization: {} });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Planen er lagret."),
    );
  });
});
