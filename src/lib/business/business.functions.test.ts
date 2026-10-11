import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: { admin: {} as Record<string, unknown> },
};

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: input.context ?? defaultContext });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      middleware: () => fn,
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("@/lib/turnstile.server", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/rate-limit.server", () => ({
  assertNotRateLimited: vi.fn().mockResolvedValue(undefined),
  assertUserNotRateLimited: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/brreg.server", () => ({ fetchOrganizationFromBrreg: vi.fn() }));
const sendInternalEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email.server", () => ({
  sendInternalEmail: (...args: unknown[]) => sendInternalEmail(...args),
}));

const sendBusinessReceipt = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/business/business-emails.server", () => ({
  sendBusinessReceipt: (...args: unknown[]) => sendBusinessReceipt(...args),
}));
/** Emne og mottakervalg for kvitteringene som ble sendt. */
const receipts = () =>
  sendBusinessReceipt.mock.calls.map(([, , build, options]) => ({
    subject: (build as () => { subject: string })().subject,
    options,
  }));

const defaultContext = { userId: "superuser-1", supabase: supabaseAdmin };

import { createOrganizationLocation } from "./locations.functions";
import { getBusinessListingStats, updateBusinessProfile } from "./organization.functions";
import { requestProffSubscription, setBusinessPlan } from "./plans.functions";
import { lookupBusinessOrganization } from "./signup.functions";
import {
  acceptOrganizationInvite,
  inviteOrganizationMember,
  resendOrganizationInvite,
  removeOrganizationMember,
} from "./members.functions";
import { fetchOrganizationFromBrreg } from "@/lib/brreg.server";

const organizationId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

function buildAdmin(
  overrides: {
    organization?: Record<string, unknown>;
    existingOrganization?: Record<string, unknown> | null;
    membership?: Record<string, unknown> | null;
    listingStats?: Record<string, unknown>[];
    listingStatusHistory?: Record<string, unknown>[];
    sales?: Record<string, unknown>[];
    viewEvents?: Record<string, unknown>[];
    contactEmail?: string | null;
    proff?: boolean;
  } = {},
) {
  const organization = {
    id: organizationId,
    organization_number: "974760673",
    legal_name: "Eksempel AS",
    display_name: "Eksempel",
    postal_code: "0001",
    city: "Oslo",
    selected_plan: null,
    proff_trial_started_at: null,
    proff_trial_ends_at: null,
    proff_trial_cancelled_at: null,
    proff_subscription_cancelled_at: null,
    proff_ended_by_kaupet_at: null,
    proff_access_until: null,
    website_url: null,
    logo_path: null,
    brand_palette: null,
    listing_concept: "redaksjonell",
    listing_font: "newsreader",
    listing_overtitle: "presentert_av",
    ...overrides.organization,
  };
  const membership =
    overrides.membership === undefined
      ? { organization_id: organizationId, role: "superuser", status: "active" }
      : overrides.membership;
  const calls = { updates: [] as Record<string, unknown>[] };
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gt", "lt", "in", "gte", "order", "limit"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(async () => ({
      data:
        table === "organizations"
          ? (overrides.existingOrganization ?? null)
          : table === "organization_members"
            ? membership
            : null,
      error: null,
    }));
    chain.single = vi.fn(async () => ({
      data:
        table === "organization_members"
          ? { organization_id: organizationId }
          : table === "proff_orders"
            ? {
                id: "33333333-3333-4333-8333-333333333333",
                term: "yearly",
                status: "pending",
                price_ex_vat_nok: 16092,
                billing_email: "faktura@eksempel.no",
                billing_reference: null,
                fiken_invoice_number: null,
                period_start: null,
                period_end: null,
                created_at: "2026-09-02T08:00:00.000Z",
              }
            : organization,
      error: null,
    }));
    chain.update = vi.fn((updates: Record<string, unknown>) => {
      calls.updates.push(updates);
      Object.assign(organization, updates);
      return chain;
    });
    chain.insert = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve({
        data:
          table === "user_roles"
            ? [{ user_id: "admin-user-1" }]
            : table === "organizations"
              ? [organization]
              : table === "listings"
                ? (overrides.listingStats ?? null)
                : table === "listing_status_history"
                  ? (overrides.listingStatusHistory ?? null)
                  : table === "listing_sales"
                    ? (overrides.sales ?? null)
                    : table === "listing_view_events"
                      ? (overrides.viewEvents ?? null)
                      : null,
        error: null,
      }).then(resolve, reject);
    return chain;
  };
  supabaseAdmin.from.mockImplementation((table: string) => makeChain(table));
  supabaseAdmin.rpc.mockImplementation((name: string) => {
    if (name === "request_proff_subscription_order") {
      if (
        organization.proff_ended_by_kaupet_at &&
        Date.parse(organization.proff_access_until ?? "") > Date.now()
      ) {
        return { data: null, error: { message: "agreement_ended_by_kaupet" } };
      }
      if (organization.proff_trial_started_at)
        return { data: "33333333-3333-4333-8333-333333333333", error: null };
      const ends = new Date(Date.now() + 30 * 864e5).toISOString();
      Object.assign(organization, {
        selected_plan: "proff",
        proff_trial_started_at: new Date().toISOString(),
        proff_trial_ends_at: ends,
        proff_access_until: ends,
      });
      return { data: "33333333-3333-4333-8333-333333333333", error: null };
    }
    if (name === "cancel_proff_trial") {
      const claimed = !organization.proff_trial_cancelled_at;
      if (claimed)
        Object.assign(organization, {
          selected_plan: "proff_basis",
          proff_trial_cancelled_at: new Date().toISOString(),
          proff_access_until: new Date().toISOString(),
        });
      const result = {
        data: {
          claimed,
          cancelled_at: organization.proff_trial_cancelled_at,
          sent_invoice_number: null,
        },
        error: null,
      };
      return { single: async () => result };
    }
    if (name === "cancel_proff_subscription") {
      const claimed = !organization.proff_subscription_cancelled_at;
      if (claimed)
        Object.assign(organization, { proff_subscription_cancelled_at: new Date().toISOString() });
      return {
        data: [
          { claimed, access_until: organization.proff_access_until, sent_invoice_number: null },
        ],
        error: null,
      };
    }
    if (name === "organization_has_proff_access") {
      return {
        data:
          overrides.proff ??
          (organization.selected_plan === "proff" && Boolean(organization.proff_access_until)),
        error: null,
      };
    }
    return { data: null, error: null };
  });
  supabaseAdmin.auth.admin.getUserById = vi.fn().mockResolvedValue({
    data: { user: overrides.contactEmail ? { email: overrides.contactEmail } : null },
    error: null,
  });
  supabaseAdmin.auth.admin.inviteUserByEmail = vi.fn().mockResolvedValue({
    data: { user: { id: "invited-user-1" } },
    error: null,
  });
  supabaseAdmin.auth.admin.deleteUser = vi.fn().mockResolvedValue({ error: null });
  return { organization, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildAdmin();
});

describe("business server functions", () => {
  it("DEF-BUS-01: oppretter lokasjon med autentisert brukerklient", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: memberId, error: null });
    await expect(
      (createOrganizationLocation as unknown as (input: unknown) => Promise<unknown>)({
        data: { name: "Oslo", addressLine: "Storgata 1", postalCode: "0150", city: "Oslo" },
        context: { userId: "superuser-1", supabase: { rpc } },
      }),
    ).resolves.toEqual({ location: memberId });
    expect(rpc).toHaveBeenCalledWith(
      "create_organization_location",
      expect.objectContaining({ _organization_id: organizationId }),
    );
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith(
      "create_organization_location",
      expect.anything(),
    );
  });

  it("DEF-INVITE-02: duplikat bevarer Auth-bruker og eksisterende medlemsrettigheter", async () => {
    buildAdmin({ proff: true });
    const original = supabaseAdmin.from.getMockImplementation()!;
    const deletes = vi.fn();
    supabaseAdmin.from.mockImplementation((table: string) => {
      const chain = original(table);
      if (table === "organization_members") {
        let targetLookup = false;
        chain.select = (columns: string) => {
          targetLookup = columns === "status";
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: targetLookup
            ? { status: "invited" }
            : { organization_id: organizationId, role: "superuser", status: "active" },
          error: null,
        });
        chain.insert = () => ({
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: null, error: { code: "23505", message: "duplicate" } }),
        });
        chain.delete = deletes;
      }
      return chain;
    });
    await expect(
      inviteOrganizationMember({
        data: {
          name: "Kari Nordmann",
          email: "kari@example.com",
          locationAssignments: [
            {
              locationId: memberId,
              role: "member",
              listingAccess: "own",
              listingEditScope: "own",
              chatAccess: "own",
            },
          ],
        },
      }),
    ).resolves.toEqual({
      userId: "invited-user-1",
      email: "kari@example.com",
      alreadyInvited: true,
    });
    expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(deletes).not.toHaveBeenCalled();
  });

  it("DEF-INVITE-02: innsettingsfeil sletter aldri en eksisterende Auth-bruker", async () => {
    buildAdmin({ proff: true });
    const original = supabaseAdmin.from.getMockImplementation()!;
    supabaseAdmin.from.mockImplementation((table: string) => {
      const chain = original(table);
      if (table === "organization_members") {
        chain.insert = () => ({
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: null, error: { code: "XX000", message: "insert failed" } }),
        });
      }
      return chain;
    });
    await expect(
      inviteOrganizationMember({
        data: {
          name: "Kari Nordmann",
          email: "kari@example.com",
          locationAssignments: [
            {
              locationId: memberId,
              role: "member",
              listingAccess: "own",
              listingEditScope: "own",
              chatAccess: "own",
            },
          ],
        },
      }),
    ).rejects.toThrow();
    expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each([0, 20_000, 60_000, 60_001, 86_400_000])(
    "DEF-INVITE-02: innsettingsfeil beholder Auth-brukeren opprettet for %i ms siden",
    async (age) => {
      buildAdmin({ proff: true });
      supabaseAdmin.auth.admin.inviteUserByEmail = vi.fn().mockResolvedValue({
        data: {
          user: { id: "invited-user-1", created_at: new Date(Date.now() - age).toISOString() },
        },
        error: null,
      });
      const original = supabaseAdmin.from.getMockImplementation()!;
      supabaseAdmin.from.mockImplementation((table: string) => {
        const chain = original(table);
        if (table === "organization_members") {
          chain.insert = () => ({
            then: (resolve: (value: unknown) => unknown) =>
              resolve({ data: null, error: { code: "XX000", message: "insert failed" } }),
          });
        }
        return chain;
      });
      await expect(
        inviteOrganizationMember({
          data: {
            name: "Kari Nordmann",
            email: "kari@example.com",
            locationAssignments: [
              {
                locationId: memberId,
                role: "member",
                listingAccess: "own",
                listingEditScope: "own",
                chatAccess: "own",
              },
            ],
          },
        }),
      ).rejects.toThrow();
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
    },
  );

  it.each(["organization_member_categories", "organization_location_members"])(
    "DEF-INVITE-02: feil i %s rydder medlemskapet uten å slette Auth-kontoen",
    async (failedTable) => {
      buildAdmin({ proff: true });
      supabaseAdmin.auth.admin.inviteUserByEmail = vi.fn().mockResolvedValue({
        data: { user: { id: "invited-user-1", created_at: new Date().toISOString() } },
        error: null,
      });
      const original = supabaseAdmin.from.getMockImplementation()!;
      const removeMembership = vi.fn().mockResolvedValue({ error: null });
      supabaseAdmin.from.mockImplementation((table: string) => {
        const chain = original(table);
        if (table === failedTable)
          chain.insert = () =>
            Promise.resolve({ error: { code: "23503", message: "invalid assignment" } });
        if (table === "organization_members") chain.delete = () => ({ match: removeMembership });
        return chain;
      });
      await expect(
        inviteOrganizationMember({
          data: {
            name: "Kari Nordmann",
            email: "kari@example.com",
            permissions: {
              role: "member",
              canCreateListings: true,
              categoryAccess: "restricted",
              allowedCategoryIds: [memberId],
            },
            locationAssignments: [
              {
                locationId: memberId,
                role: "member",
                listingAccess: "own",
                listingEditScope: "own",
                chatAccess: "own",
              },
            ],
          },
        }),
      ).rejects.toThrow();
      expect(removeMembership).toHaveBeenCalledWith({
        organization_id: organizationId,
        user_id: "invited-user-1",
        status: "invited",
      });
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
    },
  );

  it("henter annonseverdier med visninger for bedriftens oversikt", async () => {
    const listingCreatedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    buildAdmin({
      listingStats: [
        {
          id: "listing-1",
          status: "active",
          created_at: listingCreatedAt,
          listing_view_totals: { total_views: 12 },
        },
        {
          id: "listing-2",
          status: "draft",
          created_at: listingCreatedAt,
          listing_view_totals: null,
        },
      ],
    });

    const result = await getBusinessListingStats({
      data: { locationId: null, threshold: 10, soldDays: 30 },
    });

    expect(result.current).toEqual([
      {
        id: "listing-1",
        status: "active",
        viewCount: 12,
        createdAt: listingCreatedAt,
      },
      {
        id: "listing-2",
        status: "draft",
        viewCount: 0,
        createdAt: listingCreatedAt,
      },
    ]);
    expect(result.soldCount).toBe(0);
    expect(result.history).toHaveLength(365);
    expect(result.history.at(-1)).toMatchObject({ active: 1, inactive: 1, lowViews: 1, sold: 0 });
  });
  it("bygger historikk med statusbytte, salg og daglige visninger", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const daysAgo = (days: number) => new Date(Date.now() - days * dayMs).toISOString();
    const dayKey = (days: number) => daysAgo(days).slice(0, 10);
    const listingCreatedAt = daysAgo(10);

    buildAdmin({
      listingStats: [
        {
          id: "listing-history",
          status: "active",
          created_at: listingCreatedAt,
          listing_view_totals: { total_views: 3 },
        },
      ],
      listingStatusHistory: [
        { listing_id: "listing-history", status: "draft", changed_at: listingCreatedAt },
        { listing_id: "listing-history", status: "active", changed_at: daysAgo(5) },
      ],
      sales: [
        { listing_id: "listing-history", confirmed_at: daysAgo(2) },
        { listing_id: "listing-history", confirmed_at: daysAgo(40) },
      ],
      viewEvents: [{ listing_id: "listing-history", created_at: daysAgo(4) }],
    });

    const result = await getBusinessListingStats({
      data: { locationId: null, threshold: 3, soldDays: 7 },
    });
    const beforeActivation = result.history.find((point) => point.date === dayKey(6));
    const afterActivation = result.history.find((point) => point.date === dayKey(4));
    const beforeView = result.history.find((point) => point.date === dayKey(5));
    const afterView = result.history.find((point) => point.date === dayKey(3));
    const saleDay = result.history.find((point) => point.date === dayKey(2));

    expect(beforeActivation).toMatchObject({ active: 0, inactive: 1, sold: 0 });
    expect(afterActivation).toMatchObject({ active: 1, inactive: 0, sold: 0 });
    expect(beforeView?.lowViews).toBe(1);
    expect(afterView?.lowViews).toBe(0);
    expect(saleDay?.sold).toBe(1);
    expect(result.soldCount).toBe(1);
    const oneDayResult = await getBusinessListingStats({
      data: { locationId: null, threshold: 3, soldDays: 1 },
    });
    expect(oneDayResult.soldCount).toBe(0);
    const extendedResult = await getBusinessListingStats({
      data: { locationId: null, threshold: 3, soldDays: 45 },
    });
    expect(extendedResult.soldCount).toBe(2);
  });
  it("henviser til support uten å lekke kontaktinfo ved duplikat organisasjonsnummer (L-11)", async () => {
    buildAdmin({ existingOrganization: { id: organizationId } });

    await expect(
      lookupBusinessOrganization({ data: { organizationNumber: "974 760 673" } }),
    ).rejects.toThrow(
      "Denne bedriften er allerede registrert på Kaupet. Du kan også kontakte support på kontakt@kaupet.no.",
    );
    expect(fetchOrganizationFromBrreg).not.toHaveBeenCalled();
    expect(supabaseAdmin.auth.admin.getUserById).not.toHaveBeenCalled();
  });
  it("varsler administrator om ny Proff-bestilling og priser perioden på serveren", async () => {
    buildAdmin({ contactEmail: "admin@kaupet.no" });
    delete process.env.PROFF_ORDER_INBOX;

    const { order } = await requestProffSubscription({
      data: { term: "yearly", billingEmail: "faktura@eksempel.no" },
    });
    expect(order.price_ex_vat_nok).toBe(16092);

    expect(sendInternalEmail).toHaveBeenCalledTimes(1);
    const email = sendInternalEmail.mock.calls[0]![0] as {
      to: string[];
      subject: string;
      text: string;
    };
    // Without a configured inbox the alert still reaches the admins.
    expect(email.to).toEqual(["admin@kaupet.no"]);
    expect(email.subject).toContain("Eksempel AS");
    expect(email.text).toContain("974760673");
    expect(email.text).toContain("16092 kr eks. mva");
    expect(email.text).toContain("/admin/proff-abonnement");
  });

  it("sender Proff-varselet til PROFF_ORDER_INBOX når den er satt", async () => {
    buildAdmin();
    process.env.PROFF_ORDER_INBOX = "salg@kaupet.no";
    try {
      await requestProffSubscription({
        data: { term: "monthly", billingEmail: "faktura@eksempel.no" },
      });
      const email = sendInternalEmail.mock.calls[0]![0] as { to: string[] };
      expect(email.to).toEqual(["salg@kaupet.no"]);
    } finally {
      delete process.env.PROFF_ORDER_INBOX;
    }
  });

  it("starter ikke prøveperioden ved planvalg — den krever en bestilling", async () => {
    buildAdmin();
    await expect(setBusinessPlan({ data: { plan: "proff" } })).rejects.toThrow(
      "Bestill Proff for å starte prøveperioden.",
    );
  });

  it("starter prøveperioden atomisk med første bestilling", async () => {
    buildAdmin({ contactEmail: "admin@kaupet.no" });
    delete process.env.PROFF_ORDER_INBOX;

    await requestProffSubscription({ data: { term: "monthly", billingReference: "Kari" } });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "request_proff_subscription_order",
      expect.objectContaining({
        _organization_id: organizationId,
        _term: "monthly",
        _price_ex_vat_nok: 1490,
        _billing_reference: "Kari",
      }),
    );
    const email = sendInternalEmail.mock.calls[0]![0] as { subject: string };
    expect(email.subject).toContain("Proff-prøveperiode startet");
    expect(receipts()).toEqual([
      {
        subject: "Takk! Prøveperioden for Kaupet Proff har startet",
        options: { userIds: ["superuser-1"], includeBilling: false },
      },
    ]);
  });

  it("legger en ny bestilling rett til fakturering når prøven er brukt", async () => {
    buildAdmin({
      organization: {
        selected_plan: "proff_basis",
        proff_trial_started_at: "2026-08-01T00:00:00.000Z",
        proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
        proff_access_until: "2026-08-31T00:00:00.000Z",
      },
      proff: false,
    });

    const result = await requestProffSubscription({ data: { term: "yearly" } });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "request_proff_subscription_order",
      expect.anything(),
    );
    expect(result).toMatchObject({ trialEndsAt: null });
  });

  it("cancels an active trial immediately when basis is selected", async () => {
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_trial_started_at: "2026-09-01T00:00:00.000Z",
        proff_trial_ends_at: "2099-09-30T00:00:00.000Z",
        proff_access_until: "2099-09-30T00:00:00.000Z",
      },
      proff: true,
    });
    const result = await setBusinessPlan({ data: { plan: "proff_basis" } });
    expect(result.organization.selected_plan).toBe("proff_basis");
    expect(result.organization.proff_access_until).toEqual(expect.any(String));
    expect(result.organization.proff_trial_cancelled_at).toEqual(expect.any(String));
    expect(admin.calls.updates).toEqual([]);
    expect(receipts()).toEqual([
      {
        subject: "Prøveperioden for Kaupet Proff er avsluttet",
        options: { userIds: ["superuser-1"], includeBilling: true },
      },
    ]);
  });

  it("sender ingen bekreftelse når atomisk prøveavslutning feiler", async () => {
    buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_trial_started_at: "2026-09-01",
        proff_trial_ends_at: "2099-09-30",
        proff_access_until: "2099-09-30",
      },
      proff: true,
    });
    const rpc = supabaseAdmin.rpc.getMockImplementation()!;
    supabaseAdmin.rpc.mockImplementation((name: string, ...args: unknown[]) =>
      name === "cancel_proff_trial"
        ? { single: async () => ({ data: null, error: { code: "XX000", message: "failed" } }) }
        : rpc(name, ...args),
    );
    await expect(setBusinessPlan({ data: { plan: "proff_basis" } })).rejects.toThrow();
    expect(sendBusinessReceipt).not.toHaveBeenCalled();
  });

  it("sender ikke prøvebekreftelse på nytt når avslutningen allerede er lagret", async () => {
    buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_trial_started_at: "2026-09-01",
        proff_trial_ends_at: "2099-09-30",
        proff_access_until: "2099-09-30",
      },
      proff: true,
    });
    const rpc = supabaseAdmin.rpc.getMockImplementation()!;
    supabaseAdmin.rpc.mockImplementation((name: string, ...args: unknown[]) =>
      name === "cancel_proff_trial"
        ? { single: async () => ({ data: { claimed: false }, error: null }) }
        : rpc(name, ...args),
    );
    await setBusinessPlan({ data: { plan: "proff_basis" } });
    expect(sendBusinessReceipt).not.toHaveBeenCalled();
  });

  it("sier opp betalt Proff uten å kutte tilgangen før perioden er over", async () => {
    const paidUntil = new Date(Date.now() + 200 * 864e5).toISOString();
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_trial_started_at: "2026-08-01T00:00:00.000Z",
        proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
        proff_access_until: paidUntil,
      },
      proff: true,
    });

    const result = await setBusinessPlan({ data: { plan: "proff_basis" } });

    expect(result.organization).toMatchObject({
      selected_plan: "proff",
      proff_access_until: paidUntil,
      proff_subscription_cancelled_at: expect.any(String),
    });
    // Oppsigelse og kansellering av åpen faktura skjer atomisk i databasen.
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("cancel_proff_subscription", {
      _organization_id: organizationId,
    });
    expect(admin.calls.updates).toEqual([]);
    expect(receipts()).toEqual([
      {
        subject: "Oppsigelsen av Kaupet Proff er bekreftet",
        options: { userIds: ["superuser-1"], includeBilling: true },
      },
    ]);
  });

  it("lar bedriften angre oppsigelsen mens betalt periode løper", async () => {
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 200 * 864e5).toISOString(),
        proff_subscription_cancelled_at: "2026-10-01T00:00:00.000Z",
      },
      proff: true,
    });

    const result = await setBusinessPlan({ data: { plan: "proff" } });

    expect(result.organization.proff_subscription_cancelled_at).toBeNull();
    expect(admin.calls.updates).toEqual([{ proff_subscription_cancelled_at: null }]);
  });

  it("lar ikke bedriften angre når Kaupet har avsluttet avtalen", async () => {
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 200 * 864e5).toISOString(),
        proff_subscription_cancelled_at: "2026-10-01T00:00:00.000Z",
        proff_ended_by_kaupet_at: "2026-10-01T00:00:00.000Z",
      },
      proff: true,
    });
    await expect(setBusinessPlan({ data: { plan: "proff" } })).rejects.toThrow(
      "Proff-avtalen er avsluttet av Kaupet",
    );
    expect(admin.calls.updates).toEqual([]);
  });

  it("angrer ikke oppsigelsen når Kaupet avslutter avtalen samtidig", async () => {
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 200 * 864e5).toISOString(),
        proff_subscription_cancelled_at: "2026-10-01T00:00:00.000Z",
      },
      proff: true,
    });
    const build = supabaseAdmin.from.getMockImplementation()!;
    supabaseAdmin.from.mockImplementation((table: string) => {
      const chain = build(table);
      if (table !== "organizations") return chain;
      const isNull: string[] = [];
      let pending: Record<string, unknown> | null = null;
      chain.is = vi.fn((column: string, value: unknown) => {
        if (value === null) isNull.push(column);
        return chain;
      });
      chain.update = vi.fn((updates: Record<string, unknown>) => {
        // Admin avslutter avtalen mellom lesingen og skrivingen.
        (admin.organization as Record<string, unknown>).proff_ended_by_kaupet_at =
          "2026-10-05T00:00:00.000Z";
        pending = updates;
        return chain;
      });
      chain.then = (resolve: (value: unknown) => unknown) => {
        const org = admin.organization as Record<string, unknown>;
        const matches = isNull.every((column) => org[column] == null);
        if (pending && matches) Object.assign(org, pending);
        return Promise.resolve({ data: matches ? [org] : [], error: null }).then(resolve);
      };
      return chain;
    });

    await expect(setBusinessPlan({ data: { plan: "proff" } })).rejects.toThrow(
      "Proff-avtalen er avsluttet av Kaupet",
    );
    expect(admin.organization.proff_subscription_cancelled_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("avviser ny bestilling mens en adminavsluttet periode fortsatt løper", async () => {
    const admin = buildAdmin({
      organization: {
        selected_plan: "proff",
        proff_trial_started_at: "2026-08-01T00:00:00.000Z",
        proff_access_until: new Date(Date.now() + 200 * 864e5).toISOString(),
        proff_subscription_cancelled_at: "2026-10-01T00:00:00.000Z",
        proff_ended_by_kaupet_at: "2026-10-01T00:00:00.000Z",
      },
    });
    await expect(requestProffSubscription({ data: { term: "monthly" } })).rejects.toThrow(
      "Proff-avtalen er avsluttet av Kaupet",
    );
    expect(admin.organization.proff_ended_by_kaupet_at).not.toBeNull();
    expect(admin.calls.updates).toEqual([]);
  });

  it("rejects Proff reactivation after a used trial", async () => {
    buildAdmin({
      organization: {
        selected_plan: "proff_basis",
        proff_trial_started_at: "2026-08-01T00:00:00.000Z",
        proff_trial_ends_at: "2026-08-31T00:00:00.000Z",
        proff_access_until: "2026-08-31T00:00:00.000Z",
      },
      proff: false,
    });
    await expect(setBusinessPlan({ data: { plan: "proff" } })).rejects.toThrow(
      "Prøveperioden er brukt",
    );
  });

  it("allows basic profile fields but gates branding fields without effective Proff", async () => {
    const admin = buildAdmin({ proff: false });
    await expect(
      updateBusinessProfile({ data: { displayName: "Nytt navn" } }),
    ).resolves.toMatchObject({
      organization: { display_name: "Nytt navn" },
    });
    expect(admin.calls.updates).toContainEqual({ display_name: "Nytt navn" });
    await expect(
      updateBusinessProfile({ data: { websiteUrl: "https://example.com" } }),
    ).rejects.toThrow("aktivt Proff-abonnement");
  });

  it("lagrer alle Proff-profileringsvalg samlet og avviser dem uten aktivt Proff", async () => {
    const admin = buildAdmin({ proff: true });
    await expect(
      updateBusinessProfile({
        data: {
          listingConcept: "butikk",
          listingFont: "source_serif_4",
          listingOvertitle: "annonse_fra",
        },
      }),
    ).resolves.toMatchObject({
      organization: {
        listing_concept: "butikk",
        listing_font: "source_serif_4",
        listing_overtitle: "annonse_fra",
      },
    });
    expect(admin.calls.updates).toContainEqual({
      listing_concept: "butikk",
      listing_font: "source_serif_4",
      listing_overtitle: "annonse_fra",
    });

    buildAdmin({ proff: false });
    await expect(updateBusinessProfile({ data: { listingFont: "inter" } })).rejects.toThrow(
      "aktivt Proff-abonnement",
    );
  });

  it("requires an active superuser and Proff before inviting members", async () => {
    const locationAssignments = [
      {
        locationId: "33333333-3333-4333-8333-333333333333",
        role: "member" as const,
        listingAccess: "own" as const,
        listingEditScope: "own" as const,
        chatAccess: "own" as const,
      },
    ];
    buildAdmin({ membership: null });
    await expect(
      inviteOrganizationMember({
        data: { name: "Kari Nordmann", email: "kari@example.com", locationAssignments },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("ikke tilgang"), status: 403 });

    buildAdmin({ proff: false });
    await expect(
      inviteOrganizationMember({
        data: { name: "Kari Nordmann", email: "kari@example.com", locationAssignments },
      }),
    ).rejects.toThrow("aktivt Proff-abonnement");

    buildAdmin({ proff: true });
    await expect(
      inviteOrganizationMember({
        data: { name: "Kari Nordmann", email: "kari@example.com", locationAssignments },
      }),
    ).resolves.toEqual({
      userId: "invited-user-1",
      email: "kari@example.com",
      alreadyInvited: false,
    });
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "kari@example.com",
      expect.any(Object),
    );
  });

  it("ny utsending avviser privatkonto og medlemmer uten superbrukertilgang", async () => {
    for (const membership of [
      null,
      { organization_id: organizationId, role: "member", status: "active" },
    ]) {
      buildAdmin({ membership, proff: true });
      await expect(resendOrganizationInvite({ data: { userId: memberId } })).rejects.toMatchObject({
        status: 403,
      });
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    }
  });

  it("ny utsending når også inviterte som har åpnet lenken uten å godta", async () => {
    buildAdmin({ proff: true });
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    Object.assign(supabaseAdmin.auth, { resetPasswordForEmail });
    supabaseAdmin.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "kari@example.com", email_confirmed_at: "2026-10-09T10:00:00Z" } },
      error: null,
    });
    await expect(resendOrganizationInvite({ data: { userId: memberId } })).resolves.toEqual({
      userId: memberId,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("kari@example.com", {
      redirectTo: expect.stringContaining("/bedriftsinvitasjon"),
    });
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();

    supabaseAdmin.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "kari@example.com", email_confirmed_at: null } },
      error: null,
    });
    resetPasswordForEmail.mockClear();
    await resendOrganizationInvite({ data: { userId: memberId } });
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("kari@example.com", {
      redirectTo: expect.stringContaining("/bedriftsinvitasjon"),
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("delegates member removal and invite acceptance to the guarded database operations", async () => {
    const rpc = supabaseAdmin.rpc;
    buildAdmin({ proff: true });
    await expect(removeOrganizationMember({ data: { userId: memberId } })).resolves.toEqual({
      userId: memberId,
    });
    expect(rpc).toHaveBeenCalledWith("remove_organization_member", {
      _organization_id: organizationId,
      _user_id: memberId,
    });

    buildAdmin({
      proff: true,
      membership: { organization_id: organizationId, role: "member", status: "invited" },
    });
    rpc.mockClear();
    await expect(acceptOrganizationInvite()).resolves.toEqual({ organizationId });
    expect(rpc).toHaveBeenCalledWith("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
  });

  it("requireOrganizationMember synker ikke tilgang ved lesing (cron tar utløp)", async () => {
    buildAdmin();
    await getBusinessListingStats({ data: { locationId: null, threshold: 10, soldDays: 30 } });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith(
      "sync_organization_entitlements",
      expect.anything(),
    );
  });
});
