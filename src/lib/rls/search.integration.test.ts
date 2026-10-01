/** RLS integration tests: search. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  signInWithRetry,
  registerCategoryCleanup,
} from "../rls-test-helpers";

describe.skipIf(!canRun)(
  "RLS: listing_category_word_stats is private to server code, not client-writable",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-wordstats-${suffix}@example.com`;
    const userIds: string[] = [];
    let categoryId: string;
    const lexeme = `rlstestword${suffix}`;

    async function signIn() {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);

      categoryId = await createTestCategory(admin, `wordstats-${suffix}`);

      const { error: wordErr } = await admin
        .from("listing_category_word_stats")
        .insert({ lexeme, category_id: categoryId, listing_count: 1 });
      if (wordErr) throw wordErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin
        .from("listing_category_word_stats")
        .delete()
        .eq("lexeme", lexeme)
        .eq("category_id", categoryId);
    });

    it("keeps search statistics private to server code", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { error: wordErr } = await anon
        .from("listing_category_word_stats")
        .select("lexeme")
        .eq("lexeme", lexeme);
      expect(wordErr).not.toBeNull();
    });

    it("blocks a regular authenticated client from writing to the stats table", async () => {
      const client = await signIn();
      const { error: wordErr } = await client
        .from("listing_category_word_stats")
        .insert({ lexeme: `${lexeme}-hijack`, category_id: categoryId, listing_count: 999 });
      expect(wordErr).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("Search RPC: filters and paginates in the database", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-search-page-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userIds.push(user.user!.id);
    categoryId = await createTestCategory(admin, `search-page-${suffix}`);

    const { data, error } = await admin
      .from("listings")
      .insert([
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Volvo rimelig testbil",
          is_free: false,
          price_nok: 100_000,
          status: "active",
          condition: "good",
          lat: 59.91,
          lng: 10.75,
          attributes: { horsepower: 120 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Volvo kraftig testbil",
          is_free: false,
          price_nok: 200_000,
          status: "active",
          condition: "good",
          lat: 59.92,
          lng: 10.76,
          attributes: { horsepower: 220 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Toyota utenfor søket",
          is_free: false,
          price_nok: 50_000,
          status: "active",
          condition: "good",
          lat: 59.91,
          lng: 10.75,
          attributes: { horsepower: 90 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Testsykkel 26 tommer",
          price_nok: 1_500,
          is_free: false,
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Fin terrengsykkel til salgs",
          price_nok: 2_500,
          is_free: false,
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Erfaren sykepleier søker hybel",
          price_nok: 0,
          is_free: true,
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
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("returns bounded pages with the total count after text, category and radius filtering", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const args = {
      _include_groups: [{ mode: "all", terms: ["Volvo"] }],
      _category_ids: [categoryId],
      _conditions: ["good" as const],
      _include_free: false,
      _attribute_filters: {},
      _center_lat: 59.91,
      _center_lng: 10.75,
      _radius_km: 10,
      _sort: "price_asc",
      _limit: 1,
    };

    const first = await anon.rpc("search_listings_page", { ...args, _offset: 0 });
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);
    expect(first.data?.[0]?.price_nok).toBe(100_000);
    expect(first.data?.[0]?.total_count).toBe(2);

    const second = await anon.rpc("search_listings_page", { ...args, _offset: 1 });
    expect(second.error).toBeNull();
    expect(second.data).toHaveLength(1);
    expect(second.data?.[0]?.price_nok).toBe(200_000);
  });

  it("finner sammensatte ord der søkeordet er siste ledd i tittelen (F1)", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _include_groups: [{ mode: "any", terms: ["sykkel"] }],
      _category_ids: [categoryId],
      _sort: "new",
    });
    expect(error).toBeNull();
    const titles = data?.map((listing: { title: string }) => listing.title).sort();
    expect(titles).toEqual(["Fin terrengsykkel til salgs", "Testsykkel 26 tommer"]);
    // Negativt tilfelle: "sykkel" skal ikke tilfeldig matche et urelatert ord
    // som starter likt ("sykepleier").
    expect(titles).not.toContain("Erfaren sykepleier søker hybel");
  });

  it("applies numeric JSON attribute ranges before pagination", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _include_groups: [{ mode: "all", terms: ["Volvo"] }],
      _category_ids: [categoryId],
      _attribute_filters: { horsepower: { kind: "range", min: 200 } },
      _sort: "new",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.price_nok).toBe(200_000);
  });
});

// Radiusfilteret i search_listings_page har et forfilter på breddegrad
// (20260921120000) som finnes utelukkende for å la planleggeren bruke
// listings_active_lat_idx i stedet for å skanne hele tabellen. Forfilteret er
// ment å være et supersett av sirkelen, så resultatsettet skal være identisk
// med det eksakte haversine-uttrykket alene. De øvrige søketestene over
// plasserer annonsene i eller rett ved sentrum av radiusen, og et punkt i
// sentrum ligger innenfor enhver boks — også en for liten en. Disse testene
// legger derfor annonser på hver sin side av radiusgrensen, der en boks med
// feil størrelse eller feil radius faktisk gir feil svar. Testene er grønne
// både med og uten forfilteret — de vokter at det ikke kutter treff nær
// radiusgrensen, uavhengig av hvilken migrasjon som innfører det.
describe.skipIf(!canRun)("Search RPC: radiusgrensen etter bounding box-forfilteret", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];

  // Sentrum i Oslo. Alle testannonsene deler lengdegrad med sentrum, så
  // haversine-uttrykket reduseres til |Δbreddegrad| × 111,1949 km — avstandene
  // under er dermed eksakte, ikke omtrentlige.
  const CENTER_LAT = 59.91;
  const CENTER_LNG = 10.75;
  const KM_PER_DEGREE_LAT = 111.1949;
  const latAtDistance = (km: number) => CENTER_LAT + km / KM_PER_DEGREE_LAT;

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-search-radius-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userIds.push(user.user!.id);
    categoryId = await createTestCategory(admin, `search-radius-${suffix}`);

    const { data, error } = await admin
      .from("listings")
      .insert([
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest innenfor",
          is_free: false,
          price_nok: 1_000,
          status: "active",
          condition: "good",
          lat: latAtDistance(9.5),
          lng: CENTER_LNG,
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest utenfor",
          is_free: false,
          price_nok: 2_000,
          status: "active",
          condition: "good",
          lat: latAtDistance(10.5),
          lng: CENTER_LNG,
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest naer sentrum",
          is_free: false,
          price_nok: 3_000,
          status: "active",
          condition: "good",
          lat: latAtDistance(0.8),
          lng: CENTER_LNG,
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
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  const titlesWithinRadius = async (radiusKm: number) => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _category_ids: [categoryId],
      _center_lat: CENTER_LAT,
      _center_lng: CENTER_LNG,
      _radius_km: radiusKm,
      _sort: "new",
    });
    expect(error).toBeNull();
    return (data ?? []).map((listing: { title: string }) => listing.title).sort();
  };

  it("beholder en annonse rett innenfor radiusen, og utelater en rett utenfor", async () => {
    // 9,5 km inn i en radius på 10 ligger 0,0854° unna sentrum, mens boksen er
    // 10/110,5 = 0,0905° høy. Marginen er under 6 %, så en boks som er regnet
    // ut for lite — feil enhet, glemt klamping, eller en divisor over 110,574 —
    // kutter denne annonsen selv om sirkelen fortsatt skulle inkludert den.
    expect(await titlesWithinRadius(10)).toEqual([
      "Radiustest innenfor",
      "Radiustest naer sentrum",
    ]);
  });

  it("klamper radiusen likt i boksen og i sirkelen", async () => {
    // _radius_km under 1 klampes opp til 1 av LEAST(GREATEST(...)) i
    // haversine-uttrykket. Forfilteret må klampe nøyaktig likt: brukte boksen
    // den rå verdien 0,5 ville halvhøyden blitt 0,0045° og annonsen 0,8 km unna
    // (0,0072°) falt utenfor — et treff sirkelen fortsatt regner som innenfor.
    expect(await titlesWithinRadius(0.5)).toEqual(["Radiustest naer sentrum"]);
  });
});

describe.skipIf(!canRun)("WTB search RPC: finds compound words (J4, twin of F1)", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const wtbIds: string[] = [];

  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-wtb-search-page-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userIds.push(user.user!.id);
    categoryId = await createTestCategory(admin, `wtb-search-page-${suffix}`);

    const { data, error } = await admin
      .from("wtb_listings")
      .insert([
        {
          user_id: user.user!.id,
          category_id: categoryId,
          title: "Ønsker terrengsykkel",
          status: "active",
        },
        {
          user_id: user.user!.id,
          category_id: categoryId,
          title: "Ser etter testsykkel til barnet",
          status: "active",
        },
        {
          user_id: user.user!.id,
          category_id: categoryId,
          title: "Erfaren sykepleier tilbyr hjemmehjelp",
          status: "active",
        },
      ])
      .select("id");
    if (error) throw error;
    wtbIds.push(...data.map((row) => row.id));
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("wtb_listings").delete().in("id", wtbIds);
    await admin.from("categories").delete().eq("id", categoryId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("finner sammensatte ord der søkeordet er siste ledd i tittelen (J4)", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc(
      "wtb_listings_match_page" as never,
      {
        _q: "sykkel",
        _category_ids: [categoryId],
        _limit: 20,
        _offset: 0,
      } as never,
    );
    expect(error).toBeNull();
    const matchedIds = new Set((data as { id: string }[] | null)?.map((row) => row.id));
    expect(matchedIds.has(wtbIds[0])).toBe(true); // "Ønsker terrengsykkel"
    expect(matchedIds.has(wtbIds[1])).toBe(true); // "Ser etter testsykkel til barnet"
    // Negativt tilfelle: "sykkel" skal ikke tilfeldig matche et urelatert ord
    // som starter likt ("sykepleier").
    expect(matchedIds.has(wtbIds[2])).toBe(false);

    const { data: countData, error: countError } = await anon.rpc(
      "wtb_listings_match_count" as never,
      { _q: "sykkel", _category_ids: [categoryId] } as never,
    );
    expect(countError).toBeNull();
    expect(countData).toBe(2);
  });
});

// Deletes the categories created by createTestCategory() above. Registered last so
// it runs after the block-local afterAll hooks (see rls-test-helpers.ts).
registerCategoryCleanup();
