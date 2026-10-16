import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && anonKey && serviceKey);
const PASSWORD = "test-password-12345";

describe.skipIf(!canRun)("B16: fasetter, tallverdier og kategoriflytting", () => {
  const admin = canRun ? createClient<Database>(url!, serviceKey!) : null!;
  const anon = canRun ? createClient<Database>(url!, anonKey!) : null!;
  const suffix = Date.now();
  const email = `search-facets-${suffix}@example.com`;
  let userId: string;
  let categoryIds: string[] = [];
  let filterIds: string[] = [];
  let listingIds: string[] = [];

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userId = user.user!.id;

    // A og B er to foreldre med samme filternøkkel men ulike etiketter; barnet
    // starter under A.
    const { data: parents, error: parentError } = await admin
      .from("categories")
      .insert([
        { slug: `facet-a-${suffix}`, name_nb: "Forelder A" },
        { slug: `facet-b-${suffix}`, name_nb: "Forelder B" },
      ])
      .select("id");
    if (parentError) throw parentError;
    const { data: child, error: childError } = await admin
      .from("categories")
      .insert({ slug: `facet-child-${suffix}`, name_nb: "Barn", parent_id: parents[0].id })
      .select("id")
      .single();
    if (childError) throw childError;
    categoryIds = [parents[0].id, parents[1].id, child.id];

    const { data: filters, error: filterError } = await admin
      .from("category_filters")
      .insert([
        {
          category_id: parents[0].id,
          key: `probe_color_${suffix}`,
          label_nb: "Farge",
          type: "select",
          options: [{ value: "red", label_nb: "Rubinprobe" }],
        },
        {
          category_id: parents[1].id,
          key: `probe_color_${suffix}`,
          label_nb: "Farge",
          type: "select",
          options: [{ value: "red", label_nb: "Safirprobe" }],
        },
        {
          category_id: parents[0].id,
          key: "horsepower",
          label_nb: "Hestekrefter",
          type: "range",
        },
      ])
      .select("id");
    if (filterError) throw filterError;
    filterIds = filters.map(({ id }) => id);

    const { data: listings, error: listingError } = await admin
      .from("listings")
      .insert(
        [
          {
            title: `Diesel med fitment ${suffix}`,
            attributes: {
              fuel_type: "diesel",
              next_eu_control: "2026-11-01",
              part_fitment_vehicle_ids: ["model-a", "model-b"],
              [`probe_color_${suffix}`]: "red",
              horsepower: 150,
            },
          },
          {
            title: `Ugyldig tall ${suffix}`,
            attributes: { fuel_type: "petrol", horsepower: 120, mileage_km: 1000 },
          },
        ].map((listing) => ({
          seller_id: userId,
          category_id: child.id,
          price_nok: 100,
          is_free: false,
          description: "",
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
    if (filterIds.length) await admin.from("category_filters").delete().in("id", filterIds);
    if (categoryIds.length) {
      await admin.from("categories").delete().eq("id", categoryIds[2]);
      await admin.from("categories").delete().in("id", categoryIds.slice(0, 2));
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  // Fasett-RPC-en er bare tilgjengelig for serveren (listing-facet.functions.ts).
  const facet = (activeAttrs: Record<string, unknown>, keys: string[]) =>
    admin.rpc("listing_filter_facet_counts", {
      p_category_ids: [categoryIds[2]],
      p_active_attrs: activeAttrs as never,
      p_facet_keys: keys,
    });

  // KG-27-F01: fasetten ignorerte dato og sammenlignet lister som hel JSON-tekst.
  it("følger datofilteret slik søket gjør", async () => {
    const { data, error } = await facet(
      { next_eu_control: { kind: "date_min", value: "2026-12-01" } },
      ["fuel_type"],
    );
    expect(error).toBeNull();
    expect(data?.find((row) => row.attr_value === "diesel")).toBeUndefined();
  });

  it("matcher listeattributter per element og teller listeverdier hver for seg", async () => {
    const { data, error } = await facet(
      { part_fitment_vehicle_ids: { kind: "multiselect", values: ["model-a"] } },
      ["fuel_type", "part_fitment_vehicle_ids"],
    );
    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        { attr_key: "fuel_type", attr_value: "diesel", cnt: 1 },
        { attr_key: "part_fitment_vehicle_ids", attr_value: "model-a", cnt: 1 },
        { attr_key: "part_fitment_vehicle_ids", attr_value: "model-b", cnt: 1 },
      ]),
    );
  });

  // KG-27-F02: en eiers ugyldige tall stoppet fasetter og forsidens utvalg for alle.
  it("tåler ugyldige lagrede tall hos en annen eier", async () => {
    const owner = createClient<Database>(url!, anonKey!);
    const { error: signInError } = await owner.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    expect(signInError).toBeNull();
    // Databasen avviser nå ugyldige tall (20261015160000). Eldre data lagret
    // før det simuleres ved å skrive mens feltet midlertidig er tekst.
    const setHorsepowerType = (type: "text" | "range") =>
      admin.from("category_filters").update({ type }).eq("id", filterIds[2]);
    expect((await setHorsepowerType("text")).error).toBeNull();
    const { error: updateError } = await owner
      .from("listings")
      .update({ attributes: { fuel_type: "petrol", horsepower: "oops", mileage_km: "oops" } })
      .eq("id", listingIds[1]);
    expect((await setHorsepowerType("range")).error).toBeNull();
    expect(updateError).toBeNull();

    const facets = await facet({ horsepower: { kind: "range", min: 100 } }, ["fuel_type"]);
    expect(facets.error).toBeNull();
    expect(facets.data).toEqual([{ attr_key: "fuel_type", attr_value: "diesel", cnt: 1 }]);

    const popular = await anon.rpc("popular_listings_by_category", {
      _category_ids: [categoryIds[2]],
    });
    expect(popular.error).toBeNull();
  });

  // KG-27-F03: søkevektoren beholdt gamle arvede etiketter etter flytting.
  it("oppdaterer søkevektoren når kategorien flyttes til en ny forelder", async () => {
    const search = (term: string) =>
      anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "all", terms: [term] }],
        _category_ids: [categoryIds[2]],
        _sort: "new",
      });
    expect((await search("Rubinprobe")).data?.map(({ id }) => id)).toEqual([listingIds[0]]);

    const { error } = await admin
      .from("categories")
      .update({ parent_id: categoryIds[1] })
      .eq("id", categoryIds[2]);
    expect(error).toBeNull();

    expect((await search("Safirprobe")).data?.map(({ id }) => id)).toEqual([listingIds[0]]);
    expect((await search("Rubinprobe")).data).toEqual([]);
  });
});
