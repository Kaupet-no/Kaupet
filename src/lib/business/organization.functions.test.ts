import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseAdmin, membership, hasEffectiveProffAccess } = vi.hoisted(() => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
  membership: { role: "member" as "member" | "superuser" },
  hasEffectiveProffAccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (clientFn: (...args: unknown[]) => unknown) => clientFn }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: unknown } = {}) =>
      handler!({ data: validator(input.data), context: input.context });
    Object.assign(fn, {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/business/organization-access", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireOrganizationMember: async () => ({
    supabaseAdmin,
    organizationId: "org-1",
    role: membership.role,
    status: "active",
  }),
  hasEffectiveProffAccess,
}));

import { getBusinessListingStats } from "./organization.functions";

/** Thenable spørringsbygger som returnerer `rows`. */
function table(rows: Record<string, unknown>[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return query;
}

const LOCATION_A = "00000000-0000-4000-8000-00000000000a";
const LOCATION_B = "00000000-0000-4000-8000-00000000000b";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const emptyInputs = { listings: [], status_history: [], sales: [], view_days: [] };

type Stats = {
  current: Array<{ id: string; status: string; viewCount: number }>;
  soldCount: number;
  history: Array<{
    date: string;
    active: number;
    inactive: number;
    lowViews: number;
    sold: number;
  }>;
};

beforeEach(() => {
  membership.role = "member";
  hasEffectiveProffAccess.mockReset().mockResolvedValue(true);
  supabaseAdmin.from.mockReset().mockImplementation(() => table([{ location_id: "loc-a" }]));
  supabaseAdmin.rpc.mockReset().mockResolvedValue({ data: emptyInputs, error: null });
});

const call = (locationId: string | null = null, threshold = 10) =>
  getBusinessListingStats({
    data: { locationId, threshold, soldDays: 30 },
    context: { userId: "user-1" },
  } as never) as Promise<Stats>;

describe("getBusinessListingStats", () => {
  // KG-06-F04 / KG-06-F02: innsynet (can_view_organization_listing) og
  // avkortingen ligger i RPC-en og testes i business-listing-stats.integration.test.ts.
  it("henter grunnlaget i ett RPC-kall med brukeren og lokasjonen", async () => {
    await call(LOCATION_A);
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "business_listing_stats_inputs",
      expect.objectContaining({
        _organization_id: "org-1",
        _user_id: "user-1",
        _location_id: LOCATION_A,
      }),
    );
  });

  it("avviser medlemmer uten tildeling på lokasjonen", async () => {
    supabaseAdmin.from.mockImplementation(() => table([]));
    await expect(call(LOCATION_B)).rejects.toThrow();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("avviser medlemmer når Proff er utløpt", async () => {
    hasEffectiveProffAccess.mockResolvedValue(false);
    await expect(call()).rejects.toThrow();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("superbruker henter statistikk uten tildelings- og Proff-oppslag", async () => {
    membership.role = "superuser";
    await call();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
    expect(hasEffectiveProffAccess).not.toHaveBeenCalled();
  });

  it("kaster når RPC-en feiler", async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: null, error: { message: "db nede" } });
    await expect(call()).rejects.toThrow();
  });

  it("bygger dagsserien fra statushistorikk, visninger per dag og salg", async () => {
    supabaseAdmin.rpc.mockResolvedValue({
      data: {
        listings: [
          { id: "solgt", status: "sold", created_at: daysAgo(10), total_views: 20 },
          { id: "uten-historikk", status: "active", created_at: daysAgo(5), total_views: 0 },
        ],
        status_history: [
          { listing_id: "solgt", status: "active", changed_at: daysAgo(10) },
          { listing_id: "solgt", status: "sold", changed_at: daysAgo(2) },
        ],
        sales: [{ listing_id: "solgt", confirmed_at: daysAgo(2) }],
        // 15 av 20 visninger er kjent per dag; 5 ligger før vinduet.
        view_days: [
          { listing_id: "solgt", day: daysAgo(8).slice(0, 10), views: 10 },
          { listing_id: "solgt", day: daysAgo(3).slice(0, 10), views: 5 },
        ],
      },
      error: null,
    });
    const stats = await call(null, 15);
    const at = (days: number) => stats.history.find((p) => p.date === daysAgo(days).slice(0, 10));

    expect(stats.history).toHaveLength(365);
    expect(stats.current.map((row) => [row.id, row.viewCount])).toEqual([
      ["solgt", 20],
      ["uten-historikk", 0],
    ]);
    expect(stats.soldCount).toBe(1);
    expect(at(11)).toMatchObject({ active: 0, inactive: 0, lowViews: 0 });
    // Terskel 15: 5 visninger fra før vinduet, +10 fra dag 8, +5 fra dag 3.
    expect(at(9)).toMatchObject({ active: 1, inactive: 0, lowViews: 1 });
    expect(at(6)).toMatchObject({ active: 1, inactive: 0, lowViews: 0 });
    expect(at(4)).toMatchObject({ active: 2, inactive: 0, lowViews: 1 });
    expect(at(1)).toMatchObject({ active: 1, inactive: 1, lowViews: 1, sold: 0 });
    expect(at(2)).toMatchObject({ sold: 1 });
  });
});
