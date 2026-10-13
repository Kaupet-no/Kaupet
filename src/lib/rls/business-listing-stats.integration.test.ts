/** RLS integration tests: business_listing_stats_inputs. Run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

type StatsInputs = {
  listings: Array<{ id: string; status: string; created_at: string; total_views: number }>;
  status_history: Array<{ listing_id: string; status: string; changed_at: string }>;
  sales: Array<{ listing_id: string; confirmed_at: string }>;
  view_days: Array<{ listing_id: string; day: string; views: number }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

describe.skipIf(!canRun)("RLS: business_listing_stats_inputs", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-stats-owner-${suffix}@example.com`,
    member: `rls-stats-member-${suffix}@example.com`,
    outsider: `rls-stats-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  const listingIds: string[] = [];
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let organizationId: string;
  let locationA: string;
  let locationB: string;
  let memberOwnA: string;
  let ownerA: string;
  let ownerB: string;
  let otherOrganizationId: string;
  let otherOrganizationListing: string;

  const stats = async (userId: string | null, locationId: string | null = null) => {
    const { data, error } = await admin.rpc("business_listing_stats_inputs", {
      _organization_id: organizationId,
      _user_id: userId,
      _location_id: locationId,
      _views_since: daysAgo(364),
      _sales_since: daysAgo(365),
    });
    if (error) throw error;
    return data as StatsInputs;
  };
  const ids = (result: StatsInputs) => result.listings.map((listing) => listing.id).sort();

  beforeAll(async () => {
    ownerId = await createRlsUser(admin, emails.owner, userIds);
    memberId = await createRlsUser(admin, emails.member, userIds);
    outsiderId = await createRlsUser(admin, emails.outsider, userIds);

    const createOrganization = async (number: number, name: string) => {
      const { data, error } = await admin
        .from("organizations")
        .insert({
          organization_number: String(number),
          legal_name: name,
          display_name: name,
          selected_plan: "proff",
          proff_trial_started_at: daysAgo(1),
          proff_trial_ends_at: daysAgo(-30),
          proff_access_until: daysAgo(-30),
          verification_status: "verified",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };
    const createLocation = async (orgId: string, name: string, isDefault: boolean) => {
      const { data, error } = await admin
        .from("organization_locations")
        .insert({
          organization_id: orgId,
          name,
          address_line: "Storgata 1",
          postal_code: "0001",
          city: "Oslo",
          is_default: isDefault,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };
    const organizationNumber = 100_000_000 + (suffix % 800_000_000);
    organizationId = await createOrganization(organizationNumber, `RLS Stats ${suffix}`);
    otherOrganizationId = await createOrganization(
      organizationNumber + 1,
      `RLS Stats annen ${suffix}`,
    );
    locationA = await createLocation(organizationId, "Lokasjon A", true);
    locationB = await createLocation(organizationId, "Lokasjon B", false);
    const otherLocation = await createLocation(otherOrganizationId, "Annen", true);

    const { error: memberError } = await admin.from("organization_members").insert([
      { organization_id: organizationId, user_id: ownerId, role: "superuser", status: "active" },
      { organization_id: organizationId, user_id: memberId, role: "member", status: "active" },
      {
        organization_id: otherOrganizationId,
        user_id: outsiderId,
        role: "superuser",
        status: "active",
      },
    ]);
    if (memberError) throw memberError;
    // Medlemmet ser egne annonser på A og alle annonser på B.
    const { error: locationMemberError } = await admin
      .from("organization_location_members")
      .insert([
        {
          organization_id: organizationId,
          location_id: locationA,
          user_id: memberId,
          role: "member",
          listing_access: "own",
          listing_edit_scope: "own",
          chat_access: "own",
        },
        {
          organization_id: organizationId,
          location_id: locationB,
          user_id: memberId,
          role: "member",
          listing_access: "all",
          listing_edit_scope: "none",
          chat_access: "own",
        },
      ]);
    if (locationMemberError) throw locationMemberError;

    const createListing = async (sellerId: string, orgId: string, locationId: string) => {
      const { data, error } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          organization_id: orgId,
          organization_location_id: locationId,
          title: `RLS stats ${suffix}`,
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      listingIds.push(data.id);
      return data.id as string;
    };
    memberOwnA = await createListing(memberId, organizationId, locationA);
    ownerA = await createListing(ownerId, organizationId, locationA);
    ownerB = await createListing(ownerId, organizationId, locationB);
    otherOrganizationListing = await createListing(outsiderId, otherOrganizationId, otherLocation);

    // Over PostgRESTs max_rows (1000) for å bevise at ingenting avkortes.
    const events = [
      ...Array.from({ length: 1100 }, () => ({ listing_id: ownerB, created_at: daysAgo(0) })),
      ...Array.from({ length: 100 }, () => ({ listing_id: ownerB, created_at: daysAgo(3) })),
      ...Array.from({ length: 5 }, () => ({ listing_id: ownerB, created_at: daysAgo(400) })),
      ...Array.from({ length: 7 }, () => ({ listing_id: ownerA, created_at: daysAgo(1) })),
      ...Array.from({ length: 3 }, () => ({
        listing_id: otherOrganizationListing,
        created_at: daysAgo(1),
      })),
    ];
    const { error: eventsError } = await admin.from("listing_view_events").insert(events);
    if (eventsError) throw eventsError;

    const sell = async (listingId: string, sellerId: string, confirmedAt: string) => {
      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: outsiderId, seller_id: sellerId })
        .select("id")
        .single();
      if (conversationError) throw conversationError;
      const { error } = await admin.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: sellerId,
        buyer_id: outsiderId,
        conversation_id: conversation.id,
        confirmed_at: confirmedAt,
      });
      if (error) throw error;
    };
    await sell(ownerA, ownerId, daysAgo(2));
    await sell(memberOwnA, memberId, daysAgo(400));
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listing_sales").delete().in("listing_id", listingIds);
    await admin.from("conversations").delete().in("listing_id", listingIds);
    await admin.from("listings").delete().in("id", listingIds);
    await admin.from("organizations").delete().in("id", [organizationId, otherOrganizationId]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("gir superbruker alle annonser i organisasjonen, og kan filtrere på lokasjon", async () => {
    expect(ids(await stats(ownerId))).toEqual([memberOwnA, ownerA, ownerB].sort());
    expect(ids(await stats(ownerId, locationA))).toEqual([memberOwnA, ownerA].sort());
  });

  it("gir medlem bare egne annonser på own-lokasjon og alle på all-lokasjon", async () => {
    expect(ids(await stats(memberId))).toEqual([memberOwnA, ownerB].sort());
    expect(ids(await stats(memberId, locationA))).toEqual([memberOwnA]);
  });

  it("gir tomt resultat til utenforstående og uten aktør", async () => {
    for (const userId of [outsiderId, null]) {
      const result = await stats(userId);
      expect(result).toEqual({ listings: [], status_history: [], sales: [], view_days: [] });
    }
  });

  it("aggregerer over 1000 visninger per UTC-dag uten avkorting og respekterer vinduene", async () => {
    const result = await stats(ownerId);
    const viewsFor = (listingId: string) =>
      result.view_days.filter((row) => row.listing_id === listingId);

    expect(viewsFor(ownerB)).toEqual([
      { listing_id: ownerB, day: daysAgo(3).slice(0, 10), views: 100 },
      { listing_id: ownerB, day: daysAgo(0).slice(0, 10), views: 1100 },
    ]);
    expect(viewsFor(ownerA).reduce((total, row) => total + row.views, 0)).toBe(7);
    expect(result.view_days.some((row) => row.listing_id === otherOrganizationListing)).toBe(false);
    expect(result.sales.map((sale) => sale.listing_id)).toEqual([ownerA]);
    expect(
      result.status_history.filter((row) => row.listing_id === ownerA).map((row) => row.status),
    ).toEqual(["active", "sold"]);
  });

  it("nekter klienter å kalle funksjonen", async () => {
    const clients = [
      await signInWithRetry(emails.owner),
      await signInWithRetry(emails.member),
      createClient(URL!, ANON_KEY!),
    ];
    for (const client of clients) {
      const { data, error } = await client.rpc("business_listing_stats_inputs", {
        _organization_id: organizationId,
        _user_id: ownerId,
        _location_id: null,
        _views_since: daysAgo(364),
        _sales_since: daysAgo(365),
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});
