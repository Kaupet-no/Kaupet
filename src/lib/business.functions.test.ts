import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: { admin: {} as Record<string, unknown> },
};

vi.mock("@tanstack/react-start", () => ({
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
vi.mock("@/lib/brreg.server", () => ({ fetchOrganizationFromBrreg: vi.fn() }));

const defaultContext = { userId: "superuser-1", supabase: supabaseAdmin };

import {
  acceptOrganizationInvite,
  inviteOrganizationMember,
  lookupBusinessOrganization,
  removeOrganizationMember,
  setBusinessPlan,
  updateBusinessProfile,
} from "./business.functions";

import { fetchOrganizationFromBrreg } from "@/lib/brreg.server";

const organizationId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

function buildAdmin(
  overrides: {
    organization?: Record<string, unknown>;
    existingOrganization?: Record<string, unknown> | null;
    membership?: Record<string, unknown> | null;
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
    proff_access_until: null,
    website_url: null,
    logo_path: null,
    brand_palette: null,
    ...overrides.organization,
  };
  const membership =
    overrides.membership === undefined
      ? { organization_id: organizationId, role: "superuser", status: "active" }
      : overrides.membership;
  const calls = { updates: [] as Record<string, unknown>[] };
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gt", "lt", "order", "limit"]) {
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
      data: table === "organization_members" ? { organization_id: organizationId } : organization,
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
      Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return chain;
  };
  supabaseAdmin.from.mockImplementation((table: string) => makeChain(table));
  supabaseAdmin.rpc.mockImplementation(async (name: string) => {
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
  it("viser maskert kontaktperson og support ved duplikat organisasjonsnummer", async () => {
    buildAdmin({
      existingOrganization: { id: organizationId },
      membership: {
        organization_id: organizationId,
        user_id: "contact-user-1",
        role: "superuser",
        status: "active",
      },
      contactEmail: "Kari.Nordmann@example.com",
    });

    await expect(
      lookupBusinessOrganization({ data: { organizationNumber: "974 760 673" } }),
    ).rejects.toThrow(
      "Denne bedriften er allerede registrert på Kaupet. Bedriftens kontaktperson er ka***@ex***.com. Du kan også kontakte support på kontakt@kaupet.no.",
    );
    expect(fetchOrganizationFromBrreg).not.toHaveBeenCalled();
  });
  it("starts Proff once with a thirty-day database trial and does not restart it", async () => {
    buildAdmin();
    const first = await setBusinessPlan({ data: { plan: "proff" } });
    expect(first.organization.selected_plan).toBe("proff");
    expect(first.organization.proff_trial_started_at).toEqual(expect.any(String));
    expect(first.organization.proff_trial_ends_at).toEqual(expect.any(String));
    expect(first.organization.proff_access_until).toBe(first.organization.proff_trial_ends_at);

    const second = await setBusinessPlan({ data: { plan: "proff" } });
    expect(second.organization.proff_trial_started_at).toBe(
      first.organization.proff_trial_started_at,
    );
    expect(second.organization.proff_trial_ends_at).toBe(first.organization.proff_trial_ends_at);
    expect(second.organization.proff_access_until).toBe(first.organization.proff_access_until);
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
    expect(admin.calls.updates[0]).toMatchObject({ selected_plan: "proff_basis" });
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
      updateBusinessProfile({ data: { displayName: "Nytt navn", city: "Bergen" } }),
    ).resolves.toMatchObject({
      organization: { display_name: "Nytt navn", city: "Bergen" },
    });
    expect(admin.calls.updates).toContainEqual({ display_name: "Nytt navn", city: "Bergen" });
    await expect(
      updateBusinessProfile({ data: { websiteUrl: "https://example.com" } }),
    ).rejects.toThrow("aktivt Proff-abonnement");
  });

  it("requires an active superuser and Proff before inviting members", async () => {
    buildAdmin({ membership: null });
    await expect(
      inviteOrganizationMember({ data: { name: "Kari Nordmann", email: "kari@example.com" } }),
    ).rejects.toThrow("ikke tilgang");

    buildAdmin({ proff: false });
    await expect(
      inviteOrganizationMember({ data: { name: "Kari Nordmann", email: "kari@example.com" } }),
    ).rejects.toThrow("aktivt Proff-abonnement");

    buildAdmin({ proff: true });
    await expect(
      inviteOrganizationMember({ data: { name: "Kari Nordmann", email: "kari@example.com" } }),
    ).resolves.toEqual({
      userId: "invited-user-1",
      email: "kari@example.com",
    });
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "kari@example.com",
      expect.any(Object),
    );
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
    await expect(acceptOrganizationInvite()).resolves.toEqual({ organizationId });
  });
});
