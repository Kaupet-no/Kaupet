import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && anonKey && serviceKey);

describe.skipIf(!canRun)("fritekstsøk i annonseattributter", () => {
  const admin = canRun ? createClient<Database>(url!, serviceKey!) : null!;
  const anon = canRun ? createClient<Database>(url!, anonKey!) : null!;
  const suffix = Date.now();
  let userId: string;
  let categoryIds: string[] = [];
  let filterId: string;
  let listingIds: string[] = [];

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `search-attributes-${suffix}@example.com`,
      password: "test-password-12345",
      email_confirm: true,
    });
    if (userError) throw userError;
    userId = user.user!.id;

    const { data: categories, error: categoryError } = await admin
      .from("categories")
      .insert([
        { slug: `search-car-${suffix}`, name_nb: "Testbil" },
        { slug: `search-home-${suffix}`, name_nb: "Testhjem" },
      ])
      .select("id");
    if (categoryError) throw categoryError;
    categoryIds = categories.map(({ id }) => id);

    const { data: filter, error: filterError } = await admin
      .from("category_filters")
      .insert({
        category_id: categoryIds[0],
        key: "color",
        label_nb: "Farge",
        type: "select",
        options: [{ value: "red", label_nb: "Rød" }],
      })
      .select("id")
      .single();
    if (filterError) throw filterError;
    filterId = filter.id;

    const { data: listings, error: listingError } = await admin
      .from("listings")
      .insert(
        [
          { category_id: categoryIds[0], title: "Bil", attributes: { color: "red" } },
          { category_id: categoryIds[1], title: "Bokhylle", description: "Rød bokhylle" },
          { category_id: categoryIds[1], title: "Rød TV" },
          { category_id: categoryIds[0], title: "Blå bil", attributes: { color: "blue" } },
        ].map((listing) => ({
          seller_id: userId,
          price_nok: 100,
          is_free: false,
          description: "",
          attributes: {},
          status: "active" as const,
          condition: "good" as const,
          ...listing,
        })),
      )
      .select("id");
    if (listingError) throw listingError;
    listingIds = listings.map(({ id }) => id);
  });

  afterAll(async () => {
    if (!canRun) return;
    if (listingIds.length) await admin.from("listings").delete().in("id", listingIds);
    if (filterId) await admin.from("category_filters").delete().eq("id", filterId);
    if (categoryIds.length) await admin.from("categories").delete().in("id", categoryIds);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("finner fargeverdi, beskrivelse og tittel på tvers av kategorier", async () => {
    const { data, error } = await anon.rpc("search_listings_page", {
      _include_groups: [{ mode: "all", terms: ["Rød"] }],
      _category_ids: categoryIds,
      _sort: "new",
    });
    expect(error).toBeNull();
    expect(data?.map(({ id }) => id).sort()).toEqual(listingIds.slice(0, 3).sort());

    const ids = await anon.rpc("search_listing_ids", {
      include_groups: [{ mode: "all", terms: ["Rød"] }],
    });
    expect(ids.error).toBeNull();
    const ownIds = ids.data
      ?.map(({ id }) => id)
      .filter((id) => listingIds.includes(id))
      .sort();
    expect(ownIds).toEqual(listingIds.slice(0, 3).sort());
  });
});
