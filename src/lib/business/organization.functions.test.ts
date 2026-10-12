import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseAdmin, membership, hasEffectiveProffAccess } = vi.hoisted(() => ({
  supabaseAdmin: { from: vi.fn() },
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

/** Thenable spørringsbygger som returnerer `rows` for tabellen. */
function table(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "gte", "order"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return query;
}

const listing = (id: string, location: string, seller: string) => ({
  id,
  status: "draft",
  seller_id: seller,
  organization_location_id: location,
  created_at: "2026-10-01T00:00:00Z",
  listing_view_totals: { total_views: 7 },
});

beforeEach(() => {
  membership.role = "member";
  hasEffectiveProffAccess.mockReset().mockResolvedValue(true);
  supabaseAdmin.from.mockImplementation((name: string) => {
    if (name === "organization_location_members") {
      return table([
        { location_id: "loc-a", listing_access: "all" },
        { location_id: "loc-b", listing_access: "own" },
      ]);
    }
    if (name === "listings") {
      return table([
        listing("a-other", "loc-a", "other-user"),
        listing("b-own", "loc-b", "user-1"),
        listing("b-other-draft", "loc-b", "other-user"),
      ]);
    }
    return table([]);
  });
});

const call = () =>
  getBusinessListingStats({
    data: { locationId: null, threshold: 10, soldDays: 30 },
    context: { userId: "user-1" },
  } as never) as Promise<unknown>;

// KG-06-F04: «all» på én lokasjon fjernet selgerfilteret for alle tildelte
// lokasjoner, så andres utkast ved B (der medlemmet bare har «own») ble vist.
describe("getBusinessListingStats innsyn per lokasjon", () => {
  it("viser alle ved «all»-lokasjonen, men bare egne ved «own»-lokasjonen", async () => {
    const stats = await call();
    expect(JSON.stringify(stats)).not.toContain("b-other-draft");
    expect(JSON.stringify(stats)).toContain("a-other");
    expect(JSON.stringify(stats)).toContain("b-own");
  });

  it("avviser medlemmer når Proff er utløpt", async () => {
    hasEffectiveProffAccess.mockResolvedValue(false);
    await expect(call()).rejects.toThrow();
  });

  it("superbruker ser alle annonser uten Proff-oppslag", async () => {
    membership.role = "superuser";
    const stats = await call();
    expect(JSON.stringify(stats)).toContain("b-other-draft");
    expect(hasEffectiveProffAccess).not.toHaveBeenCalled();
  });
});
