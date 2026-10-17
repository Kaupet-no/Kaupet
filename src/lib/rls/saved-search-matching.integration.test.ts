import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  URL,
  canRun,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("Saved-search matching: internal access and new matches", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const sellerEmail = `rls-match-seller-${suffix}@example.com`;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const searchIds: string[] = [];
  let sellerId: string;
  let readerId: string;
  let seller: Awaited<ReturnType<typeof signInWithRetry>>;

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, sellerEmail, userIds);
    readerId = await createRlsUser(admin, `rls-match-reader-${suffix}@example.com`, userIds);
    seller = await signInWithRetry(sellerEmail);
  });

  afterAll(async () => {
    if (searchIds.length) {
      const { error } = await admin
        .from("saved_search_notifications")
        .delete()
        .in("saved_search_id", searchIds);
      if (error) throw error;
      const { error: searchError } = await admin
        .from("saved_searches")
        .delete()
        .in("id", searchIds);
      if (searchError) throw searchError;
    }
    if (listingIds.length) {
      const { error } = await admin.from("listings").delete().in("id", listingIds);
      if (error) throw error;
    }
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  async function listing(patch: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS match listing",
        status: "active",
        price_nok: 200,
        ...patch,
      })
      .select("id")
      .single();
    if (error) throw error;
    listingIds.push(data.id);
    return data.id;
  }

  async function search(criteria: Record<string, unknown>) {
    const { data, error } = await admin
      .from("saved_searches")
      .insert({
        user_id: readerId,
        name: "RLS match regression",
        criteria,
        notify: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    searchIds.push(data.id);
    return data.id;
  }

  async function notificationCount(searchId: string, listingId: string) {
    const { count, error } = await admin
      .from("saved_search_notifications")
      .select("id", { count: "exact", head: true })
      .eq("saved_search_id", searchId)
      .eq("listing_id", listingId);
    if (error) throw error;
    return count;
  }

  it("rejects anonymous and authenticated RPC calls, while permitting the server", async () => {
    const id = await listing();
    const anon = createClient(URL!, ANON_KEY!);
    for (const client of [anon, seller]) {
      const { error } = await client.rpc("match_listing_to_saved_searches", { _listing_id: id });
      expect(error).not.toBeNull();
      expect(error?.code).toMatch(/^(42501|PGRST202)$/);
    }
    const { error } = await admin.rpc("match_listing_to_saved_searches", { _listing_id: id });
    expect(error).toBeNull();
  });

  it("does not notify for an existing match when the authenticated seller changes price", async () => {
    const token = `known-match-${suffix}`;
    const id = await listing({ title: token });
    const searchId = await search({ q: token });
    const { data, error } = await seller
      .from("listings")
      .update({ price_nok: 100 })
      .eq("id", id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await notificationCount(searchId, id)).toBe(0);
  });

  it.each([
    {
      name: "title",
      before: { title: "unrelated" },
      after: { title: "TOKEN" },
      criteria: { q: "TOKEN" },
    },
    {
      name: "description",
      before: { description: "unrelated" },
      after: { description: "TOKEN" },
      criteria: { q: "TOKEN" },
    },
    {
      name: "city",
      before: { city: "unrelated" },
      after: { city: "TOKEN" },
      criteria: { q: "TOKEN" },
    },
    {
      name: "attributes",
      before: { attributes: { fuel_type: "diesel" } },
      after: { attributes: { fuel_type: "electric" } },
      criteria: { q: "TOKEN", attributes: { fuel_type: { kind: "select", value: "electric" } } },
    },
    {
      name: "location",
      before: { lat: 0, lng: 0 },
      after: { lat: 59.91, lng: 10.75 },
      criteria: { q: "TOKEN", lat: 59.91, lng: 10.75, radius: 10 },
    },
  ])(
    "notifies for a new $name match combined with a price change",
    async ({ name, before, after, criteria }) => {
      const token = `new-match-${name}-${suffix}`;
      const replaceToken = (value: object) =>
        JSON.parse(JSON.stringify(value).replaceAll("TOKEN", token));
      const id = await listing({
        title: ["title", "description", "city"].includes(name) ? "unrelated" : token,
        ...replaceToken(before),
      });
      const searchId = await search(replaceToken(criteria));
      const { error } = await seller
        .from("listings")
        .update({ price_nok: 100, ...replaceToken(after) })
        .eq("id", id);
      expect(error).toBeNull();
      expect(await notificationCount(searchId, id)).toBe(1);
    },
  );

  // KG-26-F02: extraGroups ble aldri evaluert, så ekskluderte ord varslet likevel.
  it.each([
    {
      name: "ekskludert ord skjuler annonsen",
      groups: [{ id: "x", mode: "any", exclude: true, terms: ["ødelagt"] }],
      hit: "TOKEN hel",
      miss: "TOKEN ødelagt",
    },
    // SUP-B15-01: «alle ord»-ekskludering ble behandlet som «minst ett».
    {
      name: "ekskludering med alle ord skjuler bare hele gruppen",
      groups: [{ id: "y", mode: "all", exclude: true, terms: ["rust", "bulk"] }],
      hit: "TOKEN rust",
      miss: "TOKEN rust bulk",
    },
    {
      name: "inkluderingsgruppe med alle ord",
      groups: [{ id: "a", mode: "all", exclude: false, terms: ["rød", "ramme"] }],
      hit: "TOKEN rød ramme",
      miss: "TOKEN rød",
    },
    {
      name: "inkluderingsgruppe med minst ett ord",
      groups: [{ id: "b", mode: "any", exclude: false, terms: ["rød", "blå"] }],
      hit: "TOKEN blå",
      miss: "TOKEN grønn",
    },
    {
      name: "tom gruppe begrenser ikke",
      groups: [{ id: "e", mode: "any", exclude: false, terms: [] }],
      hit: "TOKEN",
      miss: null,
    },
    { name: "gammelt søk uten grupper", groups: undefined, hit: "TOKEN", miss: null },
  ])("ekstra søkegrupper: $name", async ({ name, groups, hit, miss }) => {
    const token = `groups-${name.replaceAll(" ", "-")}-${suffix}`;
    const searchId = await search({ q: token, ...(groups && { extraGroups: groups }) });
    const hitId = await listing({ title: hit.replace("TOKEN", token) });
    expect(await notificationCount(searchId, hitId)).toBe(1);
    if (miss) {
      const missId = await listing({ title: miss.replace("TOKEN", token) });
      expect(await notificationCount(searchId, missId)).toBe(0);
    }
  });

  it("avviser lagrede søk med ugyldig extraGroups-form", async () => {
    const { error } = await admin.from("saved_searches").insert({
      user_id: readerId,
      name: "Ugyldig gruppe",
      criteria: { q: "x", extraGroups: [{ mode: "kanskje", exclude: false, terms: [] }] },
      notify: true,
    });
    expect(error?.code).toBe("23514");
  });

  it("notifies on text-only changes and on prices entering the interval", async () => {
    const token = `text-only-${suffix}`;
    const id = await listing();
    const searchId = await search({ q: token, max: 100 });
    const { error: textError } = await seller
      .from("listings")
      .update({ title: token })
      .eq("id", id);
    expect(textError).toBeNull();
    expect(await notificationCount(searchId, id)).toBe(0);
    const { error: priceError } = await seller
      .from("listings")
      .update({ price_nok: 100 })
      .eq("id", id);
    expect(priceError).toBeNull();
    expect(await notificationCount(searchId, id)).toBe(1);

    const textSearchId = await search({ q: `${token}-edited` });
    const { error } = await seller
      .from("listings")
      .update({ title: `${token}-edited` })
      .eq("id", id);
    expect(error).toBeNull();
    expect(await notificationCount(textSearchId, id)).toBe(1);
  });
});

// KG-26-F01: ett ugyldig lagret søk eller kjøpsønske kastet i matcheren som
// listing-triggerne kaller synkront, og rullet tilbake andres publisering.
describe.skipIf(!canRun)("Saved-search/WTB matching: invalid criteria are isolated", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const sellerEmail = `rls-invalid-seller-${suffix}@example.com`;
  const buyerEmail = `rls-invalid-buyer-${suffix}@example.com`;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const wtbIds: string[] = [];
  let sellerId: string;
  let buyerId: string;
  let categoryId: string;

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, sellerEmail, userIds);
    buyerId = await createRlsUser(admin, buyerEmail, userIds);
    const { data, error } = await admin.from("categories").select("id").limit(1).single();
    if (error) throw error;
    categoryId = data.id;
  });

  afterAll(async () => {
    if (wtbIds.length) {
      await admin.from("wtb_match_notifications").delete().in("wtb_listing_id", wtbIds);
      await admin.from("wtb_listings").delete().in("id", wtbIds);
    }
    await admin.from("saved_searches").delete().eq("user_id", buyerId);
    if (listingIds.length) await admin.from("listings").delete().in("id", listingIds);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it.each([
    { name: "pris", criteria: { min: "oops" } },
    { name: "array", criteria: { categories: "bil" } },
    { name: "geo", criteria: { lat: "nord", lng: 10 } },
    { name: "flervalg", criteria: { attributes: { fuel: { kind: "multiselect", values: "x" } } } },
  ])("avviser ugyldig $name-kriterium ved lagring", async ({ criteria }) => {
    const buyer = await signInWithRetry(buyerEmail);
    const { error } = await buyer
      .from("saved_searches")
      .insert({ user_id: buyerId, name: "Ugyldig", criteria, notify: true });
    expect(error?.code).toBe("23514");
  });

  it("lagrer fortsatt gyldige søk", async () => {
    const buyer = await signInWithRetry(buyerEmail);
    const { error } = await buyer.from("saved_searches").insert({
      user_id: buyerId,
      name: "Gyldig",
      criteria: { q: "bil", min: 100, max: null, includeFree: true, lat: 59.9, lng: 10.7 },
      notify: true,
    });
    expect(error).toBeNull();
  });

  it("publisering går gjennom selv om et kjøpsønske har ugyldig dato", async () => {
    const wtb = async (minDate: string) => {
      const { data, error } = await admin
        .from("wtb_listings")
        .insert({
          user_id: buyerId,
          title: `RLS ugyldig dato ${minDate}`,
          status: "active",
          notify_matches: true,
          category_id: categoryId,
          attributes: { next_eu_control: { minDate } },
        })
        .select("id")
        .single();
      if (error) throw error;
      wtbIds.push(data.id);
      return data.id;
    };
    await wtb("2026-99-99");
    const validId = await wtb("2026-01-01");

    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS bil med EU-kontroll",
        status: "active",
        price_nok: 100,
        category_id: categoryId,
        attributes: { next_eu_control: "2026-12-01" },
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    listingIds.push(data!.id);

    const { data: notified, error: notifiedError } = await admin
      .from("wtb_match_notifications")
      .select("wtb_listing_id")
      .eq("listing_id", data!.id)
      .in("wtb_listing_id", wtbIds);
    expect(notifiedError).toBeNull();
    expect(notified?.map((row) => row.wtb_listing_id)).toEqual([validId]);
  });
});
