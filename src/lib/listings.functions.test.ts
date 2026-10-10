import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  membership: null as Record<string, unknown> | null,
  location: null as Record<string, unknown> | null,
  listing: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  updates: vi.fn(),
  inserts: [] as Array<{ table: string; value: unknown }>,
}));
const assertUserNotRateLimited = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: { userId: string } }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: { userId: "user-id" } });
    };
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
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let inserted: unknown;
      const result = () => {
        if (table === "organization_members") return { data: db.membership, error: null };
        if (table === "organization_locations") return { data: db.location, error: null };
        if (table === "organization_location_members") {
          return { data: { location_id: locationId }, error: null };
        }
        if (table === "listings" && db.listing) return { data: db.listing, error: null };
        if (table === "listings" && inserted) {
          db.inserts.push({ table, value: inserted });
          return {
            data: { id: "listing-id", kaupet_code: "KPT123", updated_at: "2026-01-01T00:00:00Z" },
            error: null,
          };
        }
        return { data: [], count: 0, error: null };
      };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte"]) {
        query[method] = () => query;
      }
      query.update = (value: unknown) => {
        db.updates(value);
        return query;
      };
      query.insert = (value: unknown) => {
        inserted = value;
        return query;
      };
      query.maybeSingle = async () => result();
      query.single = async () => result();
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject);
      return query;
    },
    rpc: db.rpc,
  },
}));
vi.mock("./organization-location.server", () => ({
  organizationListingLocation: vi.fn(async () => ({
    postal_code: "0123",
    city: "Oslo",
    lat: 59.9,
    lng: 10.7,
  })),
}));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileToken: vi.fn() }));

import {
  createListing,
  republishListing,
  saveDraftListing,
  updateListingStatus,
} from "./listings.functions";

const organizationId = "00000000-0000-0000-0000-000000000011";
const locationId = "00000000-0000-0000-0000-000000000012";
const categoryId = "00000000-0000-0000-0000-000000000013";

const listingInput = {
  title: "Gyldig annonsetittel",
  description: "Dette er en gyldig annonsebeskrivelse.",
  category_id: categoryId,
  condition: "good" as const,
  is_free: true,
  price_nok: null,
  postal_code: "0123",
  city: "Oslo",
  lat: 59.9,
  lng: 10.7,
  organization_location_id: locationId,
  can_ship: false,
};

function setOrganization(role: "superuser" | "member") {
  db.membership = {
    organization_id: organizationId,
    role,
    status: "active",
    can_create_listings: true,
    category_access: "all",
  };
  db.location = { id: locationId, organization_id: organizationId, active: true };
  db.rpc.mockImplementation(async (name: string) => {
    if (name === "organization_has_proff_access") return { data: true, error: null };
    if (name === "can_create_organization_listing") return { data: false, error: null };
    return { data: null, error: null };
  });
}

beforeEach(() => {
  db.membership = null;
  db.location = null;
  db.listing = null;
  db.rpc.mockReset();
  db.inserts = [];
  db.updates.mockReset();
  assertUserNotRateLimited.mockReset().mockResolvedValue(undefined);
});

describe("organization listing creation authorization (SEC-07)", () => {
  it("DEF-DRAFT-01: forventet bruker må samsvare før lagring eller publisering", async () => {
    const input = {
      ...listingInput,
      organization_location_id: null,
      expected_user_id: "00000000-0000-4000-8000-000000000099",
    };
    await expect(saveDraftListing({ data: input })).rejects.toMatchObject({ status: 409 });
    await expect(createListing({ data: input })).rejects.toMatchObject({ status: 409 });
    expect(db.inserts).toHaveLength(0);
  });

  it.each(["superuser", "member"] as const)(
    "blocks an unverified %s from creating active listings and drafts",
    async (role) => {
      setOrganization(role);

      await expect(createListing({ data: listingInput })).rejects.toThrow(
        "Bedriften venter på godkjenning fra Kaupet.",
      );
      await expect(
        saveDraftListing({ data: { ...listingInput, title: "Utkast" } }),
      ).rejects.toThrow("Bedriften venter på godkjenning fra Kaupet.");

      expect(db.rpc).toHaveBeenCalledWith("can_create_organization_listing", {
        _organization_id: organizationId,
        _location_id: locationId,
        _category_id: categoryId,
        _user_id: "user-id",
      });
      expect(db.inserts).toHaveLength(0);
    },
  );

  it("allows verified superuser and member creation on both server paths", async () => {
    for (const role of ["superuser", "member"] as const) {
      setOrganization(role);
      db.rpc.mockImplementation(async (name: string) => {
        if (name === "organization_has_proff_access") return { data: true, error: null };
        if (name === "can_create_organization_listing") return { data: true, error: null };
        return { data: null, error: null };
      });

      await createListing({ data: listingInput });
      await saveDraftListing({ data: { ...listingInput, title: "Utkast" } });
    }

    expect(db.inserts).toHaveLength(4);
  });

  it("keeps private listing creation outside organization authorization", async () => {
    await createListing({ data: { ...listingInput, organization_location_id: null } });
    await saveDraftListing({
      data: { ...listingInput, organization_location_id: null, title: "Utkast" },
    });

    expect(db.rpc).not.toHaveBeenCalledWith("can_create_organization_listing", expect.anything());
    expect(db.inserts).toHaveLength(2);
    expect(
      db.inserts.map(({ value }) => (value as { organization_id: string | null }).organization_id),
    ).toEqual([null, null]);
  });

  it("uses one five-per-hour user bucket before each new listing or draft insert", async () => {
    await createListing({ data: { ...listingInput, organization_location_id: null } });
    await saveDraftListing({
      data: { ...listingInput, organization_location_id: null, title: "Utkast" },
    });

    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      1,
      "user-id",
      "listing_creation",
      5,
      3600,
      "Du har publisert for mange annonser den siste timen. Prøv igjen senere.",
    );
    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      2,
      "user-id",
      "listing_creation",
      5,
      3600,
      "Du har opprettet for mange annonser den siste timen. Prøv igjen senere.",
    );
  });

  it("stops new listing inserts when the shared bucket rejects the reservation", async () => {
    assertUserNotRateLimited.mockRejectedValue(new Error("limit"));

    await expect(
      createListing({ data: { ...listingInput, organization_location_id: null } }),
    ).rejects.toThrow("limit");
    expect(db.inserts).toHaveLength(0);
  });

  it.each(["draft", "archived"] as const)(
    "%s republishing follows the existing listing creation charge",
    async (status) => {
      db.listing = {
        id: "00000000-0000-0000-0000-000000000014",
        seller_id: "user-id",
        organization_id: null,
        organization_location_id: null,
        status,
        title: "Gyldig annonsetittel",
        description: "Dette er en gyldig annonsebeskrivelse.",
        condition: "good",
        can_ship: false,
        postal_code: "0123",
        city: "Oslo",
        is_free: true,
        price_nok: null,
        category_id: categoryId,
        attributes: {},
        updated_at: "2026-01-01T00:00:00Z",
      };

      await republishListing({ data: { id: db.listing.id as string } });

      if (status === "draft") expect(assertUserNotRateLimited).not.toHaveBeenCalled();
      else {
        expect(assertUserNotRateLimited).toHaveBeenCalledWith(
          "user-id",
          "listing_creation",
          5,
          3600,
          "Du har publisert for mange annonser den siste timen. Prøv igjen senere.",
        );
      }
    },
  );

  it("fails closed when the authoritative permission RPC errors", async () => {
    setOrganization("superuser");
    db.rpc.mockImplementation(async (name: string) =>
      name === "can_create_organization_listing"
        ? { data: true, error: { message: "permission check unavailable" } }
        : { data: null, error: null },
    );

    await expect(createListing({ data: listingInput })).rejects.toThrow();
    await expect(
      saveDraftListing({ data: { ...listingInput, title: "Utkast" } }),
    ).rejects.toThrow();
    expect(db.inserts).toHaveLength(0);
  });
});

describe("updateListingStatus", () => {
  it("avviser aktiv-status som klienten forsøker å sette direkte", () => {
    expect(() =>
      updateListingStatus({
        data: { id: "00000000-0000-0000-0000-000000000001", status: "active" },
      }),
    ).toThrow();
  });
});

describe("publisering etter tapt svar", () => {
  it("bekrefter en allerede publisert annonse uten å overskrive den", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    db.listing = {
      id,
      seller_id: "user-id",
      organization_id: null,
      organization_location_id: null,
      status: "active",
      kaupet_code: "ABC123",
      updated_at: "2026-10-09T10:00:00Z",
    };
    const saved = await saveDraftListing({ data: { id, title: "Et endret utkast" } });
    expect(saved).toMatchObject({ id, kaupet_code: "ABC123", published: true });
    const published = await createListing({
      data: { ...listingInput, draftId: id, organization_location_id: null },
    });
    expect(published).toEqual({ id, kaupet_code: "ABC123" });
    expect(db.updates).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });
  it("sjekker opprettingsrett på nytt når et bedriftsutkast publiseres", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    setOrganization("member");
    db.listing = {
      id,
      seller_id: "user-id",
      organization_id: organizationId,
      organization_location_id: locationId,
      status: "draft",
      kaupet_code: "ABC124",
      category_id: categoryId,
    };
    db.rpc.mockImplementation(async (name: string) => {
      if (name === "can_update_organization_listing") return { data: true, error: null };
      if (name === "organization_has_proff_access") return { data: true, error: null };
      if (name === "can_create_organization_listing") return { data: false, error: null };
      if (name === "organization_is_verified") return { data: true, error: null };
      return { data: null, error: null };
    });
    await expect(createListing({ data: { ...listingInput, draftId: id } })).rejects.toMatchObject({
      status: 403,
    });
    expect(db.rpc).toHaveBeenCalledWith("can_create_organization_listing", {
      _organization_id: organizationId,
      _location_id: locationId,
      _category_id: categoryId,
      _user_id: "user-id",
    });
    expect(db.updates).not.toHaveBeenCalled();
  });
  it("flytter et bedriftsutkast til lokasjonen som er valgt etter første lagring", async () => {
    const id = "00000000-0000-4000-8000-000000000003";
    const newLocationId = "00000000-0000-0000-0000-000000000014";
    setOrganization("superuser");
    db.listing = {
      id,
      seller_id: "user-id",
      organization_id: organizationId,
      organization_location_id: locationId,
      status: "draft",
      kaupet_code: "ABC125",
      category_id: categoryId,
      updated_at: "2026-10-09T10:00:00Z",
    };
    db.rpc.mockImplementation(async (name: string) => {
      if (name === "can_update_organization_listing") return { data: true, error: null };
      if (name === "can_create_organization_listing") return { data: true, error: null };
      return { data: null, error: null };
    });
    await saveDraftListing({
      data: { ...listingInput, id, title: "Utkast", organization_location_id: newLocationId },
    });
    await createListing({
      data: { ...listingInput, draftId: id, organization_location_id: newLocationId },
    });
    expect(db.updates).toHaveBeenCalledTimes(2);
    for (const [fields] of db.updates.mock.calls) {
      expect(fields).toMatchObject({ organization_location_id: newLocationId });
    }
    expect(db.rpc).toHaveBeenCalledWith(
      "can_create_organization_listing",
      expect.objectContaining({ _location_id: newLocationId }),
    );
  });
  it("avviser bekreftelse av en annen brukers aktive annonse", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    db.listing = {
      id,
      seller_id: "other-user",
      organization_id: null,
      organization_location_id: null,
      status: "active",
      kaupet_code: "ABC123",
    };
    await expect(saveDraftListing({ data: { id, title: "Et utkast" } })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      createListing({ data: { ...listingInput, draftId: id, organization_location_id: null } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.updates).not.toHaveBeenCalled();
  });
});
