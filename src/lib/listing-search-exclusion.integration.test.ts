import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

describe.skipIf(!canRun)("RLS: search exclusion covers compound words (F1 exclusion side)", () => {
  const admin = canRun ? createClient<Database>(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  let userId: string;
  let categoryId: string;
  const listingIds: string[] = [];

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-search-exclusion-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userId = user.user!.id;

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .insert({ slug: `rls-search-exclusion-${suffix}`, name_nb: "RLS testkategori" })
      .select("id")
      .single();
    if (categoryError) throw categoryError;
    categoryId = category.id;

    const { data, error } = await admin
      .from("listings")
      .insert([
        {
          seller_id: userId,
          category_id: categoryId,
          title: `Terrengsykkel 26 tommer ${suffix}`,
          price_nok: 1_000,
          is_free: false,
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: userId,
          category_id: categoryId,
          title: `Sykkel 26 tommer ${suffix}`,
          price_nok: 1_000,
          is_free: false,
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: userId,
          category_id: categoryId,
          title: `Sko str 42 ${suffix}`,
          price_nok: 500,
          is_free: false,
          status: "active",
          condition: "good",
          attributes: {},
        },
      ])
      .select("id");
    if (error) throw error;
    listingIds.push(...data.map((listing) => listing.id));
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await admin.from("categories").delete().eq("id", categoryId);
    await admin.auth.admin.deleteUser(userId);
  });

  it("search_listings_page: '-sykkel' ekskluderer sammensatte ord som 'Terrengsykkel'", async () => {
    const { data, error } = await admin.rpc("search_listings_page", {
      _category_ids: [categoryId],
      _exclude_any_terms: ["sykkel"],
      _sort: "new",
    });
    expect(error).toBeNull();
    const titles = data?.map((listing: { title: string }) => listing.title) ?? [];
    expect(titles).not.toContain(`Terrengsykkel 26 tommer ${suffix}`);
    expect(titles).not.toContain(`Sykkel 26 tommer ${suffix}`);
  });

  it("search_listings_page: '-ski' overekskluderer ikke 'Sko' (vakt mot similarity > 0.25)", async () => {
    const { data, error } = await admin.rpc("search_listings_page", {
      _category_ids: [categoryId],
      _exclude_any_terms: ["ski"],
      _sort: "new",
    });
    expect(error).toBeNull();
    const titles = data?.map((listing: { title: string }) => listing.title) ?? [];
    expect(titles).toContain(`Sko str 42 ${suffix}`);
  });

  it("search_listing_ids: '-sykkel' ekskluderer sammensatte ord som 'Terrengsykkel'", async () => {
    const { data, error } = await admin.rpc("search_listing_ids", {
      exclude_any_terms: ["sykkel"],
    });
    expect(error).toBeNull();
    const ids = data?.map((row: { id: string }) => row.id) ?? [];
    const terrengsykkelId = listingIds[0];
    const sykkelId = listingIds[1];
    expect(ids).not.toContain(terrengsykkelId);
    expect(ids).not.toContain(sykkelId);
  });

  it("search_listing_ids: '-ski' overekskluderer ikke 'Sko'", async () => {
    const { data, error } = await admin.rpc("search_listing_ids", {
      exclude_any_terms: ["ski"],
    });
    expect(error).toBeNull();
    const ids = data?.map((row: { id: string }) => row.id) ?? [];
    const skoId = listingIds[2];
    expect(ids).toContain(skoId);
  });
});
