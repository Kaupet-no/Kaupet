import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

describe.skipIf(!canRun)("RLS: listing external sync RPCs", () => {
  const admin = createClient<Database>(URL!, SERVICE_ROLE_KEY!);
  const suffix = Date.now();
  const userIds: string[] = [];
  let organizationId = "";
  let locationId = "";
  let categoryId = "";
  let member: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  beforeAll(async () => {
    const createUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    const memberId = await createUser(`listing-sync-member-${suffix}@example.com`);

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({
        organization_number: `9${String(suffix).slice(-8)}`,
        legal_name: "Listing Sync Test AS",
        display_name: "Listing Sync Test",
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 86_400_000).toISOString(),
        verification_status: "verified",
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (organizationError) throw organizationError;
    organizationId = organization.id;

    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: memberId,
      role: "superuser",
      status: "active",
    });
    if (memberError) throw memberError;

    const { data: location, error: locationError } = await admin
      .from("organization_locations")
      .insert({ organization_id: organizationId, name: "Hovedkontor", active: true })
      .select("id")
      .single();
    if (locationError) throw locationError;
    locationId = location.id;

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .insert({ slug: `listing-sync-${suffix}`, name_nb: "Listing sync test" })
      .select("id")
      .single();
    if (categoryError) throw categoryError;
    categoryId = category.id;

    const signIn = async (email: string) => {
      const client = createClient<Database>(URL!, ANON_KEY!);
      const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw error;
      return client;
    };
    member = await signIn(`listing-sync-member-${suffix}@example.com`);
    anon = createClient<Database>(URL!, ANON_KEY!);
  });

  afterAll(async () => {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (categoryId) await admin.from("categories").delete().eq("id", categoryId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("avviser vanlige klienter (anon/authenticated) fra de nye synk-RPC-ene", async () => {
    const { error: anonError } = await anon.rpc("upsert_listing_from_external", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _location_id: locationId,
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_ref: "rls-check",
      _listing: { title: "x", description: "x", category_id: categoryId },
      _mode: "create",
    });
    expect(anonError).not.toBeNull();

    const { error: memberError } = await member.rpc("set_listing_status_by_external_ref", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _external_ref: "rls-check",
      _status: "sold",
    });
    expect(memberError).not.toBeNull();

    const { error: renewError } = await member.rpc("renew_listings_by_external_ref", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_refs: ["rls-check"],
    });
    expect(renewError).not.toBeNull();
  });

  it("service_role kan opprette, gjøre om (upsert) og fornye en annonse via external_ref", async () => {
    const create = await admin.rpc("upsert_listing_from_external", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _location_id: locationId,
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_ref: `sku-${suffix}`,
      _listing: {
        title: "Sykkel",
        description: "En fin sykkel",
        category_id: categoryId,
        price_nok: 1000,
      },
      _mode: "create",
    });
    expect(create.error).toBeNull();
    expect(create.data).toMatchObject({ status: "created" });
    const listingId = (create.data as { listing_id: string }).listing_id;
    expect(listingId).toBeTruthy();

    const duplicate = await admin.rpc("upsert_listing_from_external", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _location_id: locationId,
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_ref: `sku-${suffix}`,
      _listing: {
        title: "Sykkel",
        description: "En fin sykkel",
        category_id: categoryId,
        price_nok: 1000,
      },
      _mode: "create",
    });
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toMatchObject({ status: "duplicate", listing_id: listingId });

    const updated = await admin.rpc("upsert_listing_from_external", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _location_id: locationId,
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_ref: `sku-${suffix}`,
      _listing: {
        title: "Sykkel",
        description: "En fin sykkel",
        category_id: categoryId,
        price_nok: 1500,
      },
      _mode: "upsert",
    });
    expect(updated.error).toBeNull();
    expect(updated.data).toMatchObject({ status: "updated", listing_id: listingId });

    const { data: afterUpdate } = await admin
      .from("listings")
      .select("price_nok, external_ref")
      .eq("id", listingId)
      .single();
    expect(afterUpdate?.price_nok).toBe(1500);
    expect(afterUpdate?.external_ref).toBe(`sku-${suffix}`);

    const statusChanged = await admin.rpc("set_listing_status_by_external_ref", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _external_ref: `sku-${suffix}`,
      _status: "sold",
    });
    expect(statusChanged.error).toBeNull();
    expect(statusChanged.data).toMatchObject({
      status: "status_changed",
      listing_id: listingId,
      listing_status: "sold",
    });

    const notFound = await admin.rpc("set_listing_status_by_external_ref", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _external_ref: `sku-does-not-exist-${suffix}`,
      _status: "sold",
    });
    expect(notFound.error).toBeNull();
    expect(notFound.data).toMatchObject({ status: "not_found" });

    const renew = await admin.rpc("renew_listings_by_external_ref", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_refs: [`sku-${suffix}`, `sku-does-not-exist-${suffix}`],
    });
    expect(renew.error).toBeNull();
    expect(renew.data).toMatchObject({
      renewed: 0,
      reactivated: 0,
      skipped: 1,
      not_found: [`sku-does-not-exist-${suffix}`],
    });
  });

  it("dry_run skriver ingenting", async () => {
    const ref = `sku-dryrun-${suffix}`;
    const dryRun = await admin.rpc("upsert_listing_from_external", {
      _organization_id: organizationId,
      _user_id: userIds[0],
      _location_id: locationId,
      _import_id: crypto.randomUUID(),
      _source: "api",
      _external_ref: ref,
      _listing: { title: "Dryrun", description: "x", category_id: categoryId, price_nok: 100 },
      _mode: "create",
      _dry_run: true,
    });
    expect(dryRun.error).toBeNull();
    expect(dryRun.data).toMatchObject({ status: "created" });

    const { data: listing } = await admin
      .from("listings")
      .select("id")
      .eq("external_ref", ref)
      .maybeSingle();
    expect(listing).toBeNull();
  });
});
