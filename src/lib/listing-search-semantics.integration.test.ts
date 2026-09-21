import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

/**
 * Semantikkvakt for det indekserbare forhåndsfilteret i
 * public.search_listings_page (20260921120000).
 *
 * Forhåndsfilteret er ment å være et rent supersett: det skal bare kutte
 * skanningen, aldri endre treffmengden. Hver test her er valgt fordi den
 * ville blitt RØD hvis forhåndsfilteret kuttet for mye:
 *
 *  - sammensatte ord treffer bare via word_similarity, ikke via tsvector
 *  - "hodetelefon"/"Telefon til salgs" treffer BARE via similarity > 0.25
 *    (0.2609) — den ryker hvis noen bruker pg_trgm sin standardterskel 0.3
 *  - browsing uten søkeord må fortsatt gi alt (vaktleddet i forhåndsfilteret)
 *  - flere grupper er AND-et, og forhåndsfilteret bruker unionen av termene
 *  - ekskludering går utenom forhåndsfilteret og må fortsatt virke
 */
describe.skipIf(!canRun)(
  "search_listings_page: semantikk holder med indeksert forhåndsfilter",
  () => {
    const admin = canRun ? createClient<Database>(URL!, SERVICE_ROLE_KEY!) : null!;
    const anon = canRun ? createClient<Database>(URL!, ANON_KEY!) : null!;
    const suffix = Date.now();
    let userId: string;
    let categoryId: string;
    const listingIds: string[] = [];

    // Titlene har MED VILJE ingen unik suffiks: trigram-likhet regnes over hele
    // tittelen, så en påhengt tidsstempelstreng ville fortynnet similarity under
    // terskelen og gjort fuzzy-testene meningsløse. Unikheten kommer i stedet fra
    // den egne testkategorien, som alle spørringene her filtrerer på.
    //
    // Målte verdier mot public.listings_search_term_match:
    //   tittel                   | term        | similarity | word_sim | tsvector
    //   Terrengsykkel 26 tommer  | sykkel      |     0.2000 |   0.7143 | nei
    //   Testsykkel til salgs     | sykkel      |     0.2857 |   0.7143 | nei
    //   Erfaren sykepleier ...   | sykkel      |     0.1250 |   0.4286 | nei  (ikke treff)
    //   Telefon til salgs        | hodetelefon |     0.2609 |   0.5000 | nei
    // "Terrengsykkel" treffer altså BARE via word_similarity, og
    // "Telefon til salgs" BARE via similarity > 0.25. Til sammen dekker de to
    // trigram-grenene som tsvector-indeksen alene ikke ville funnet.
    const titles = {
      terrengsykkel: "Terrengsykkel 26 tommer",
      testsykkel: "Testsykkel til salgs",
      sykepleier: "Erfaren sykepleier soker hybel",
      telefon: "Telefon til salgs",
      sko: "Sko str 42",
      volvo: "Volvo kraftig testbil",
    };

    const titlesOf = (data: { title: string }[] | null) =>
      (data ?? []).map((row) => row.title).sort();

    beforeAll(async () => {
      const { data: user, error: userError } = await admin.auth.admin.createUser({
        email: `rls-search-semantics-${suffix}@example.com`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (userError) throw userError;
      userId = user.user!.id;

      const { data: category, error: categoryError } = await admin
        .from("categories")
        .insert({ slug: `rls-search-semantics-${suffix}`, name_nb: "RLS testkategori" })
        .select("id")
        .single();
      if (categoryError) throw categoryError;
      categoryId = category.id;

      // Beskrivelsene holdes nøytrale med vilje: search_vector bygges av
      // tittel + beskrivelse + sted, så et ord i beskrivelsen ville kunne gi et
      // tsvector-treff og skjule at testen egentlig måler trigram-grenene.
      const { data, error } = await admin
        .from("listings")
        .insert(
          [
            { title: titles.terrengsykkel, price_nok: 5_000 },
            { title: titles.testsykkel, price_nok: 1_500 },
            { title: titles.sykepleier, price_nok: 100 },
            { title: titles.telefon, price_nok: 4_000 },
            { title: titles.sko, price_nok: 500 },
            { title: titles.volvo, price_nok: 200_000 },
          ].map((row) => ({
            ...row,
            seller_id: userId,
            category_id: categoryId,
            description: "nummer",
            is_free: false,
            status: "active" as const,
            condition: "good" as const,
            attributes: {},
          })),
        )
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

    it("sammensatte ord: 'sykkel' treffer 'Terrengsykkel' og 'Testsykkel', men ikke 'sykepleier'", async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "any", terms: ["sykkel"] }],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toEqual([titles.terrengsykkel, titles.testsykkel].sort());
    });

    it("fuzzy via similarity > 0.25 som IKKE treffer tsvector: 'hodetelefon' finner 'Telefon til salgs'", async () => {
      // similarity = 0.2609, word_similarity = 0.50, ingen tsvector-treff.
      // Ligger i båndet 0.25–0.30, så den faller bort hvis forhåndsfilteret
      // bruker pg_trgm sin standardterskel (0.3) i stedet for 0.25.
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "any", terms: ["hodetelefon"] }],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toContain(titles.telefon);
    });

    it("browsing uten søkeord gir fortsatt alle aktive annonser", async () => {
      // Vakten i forhåndsfilteret: uten termer må hele leddet kobles ut. Var den
      // borte ville `% ANY(NULL)` gitt NULL og tømt lista.
      const { data, error } = await anon.rpc("search_listings_page", {
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toEqual(Object.values(titles).sort());
      expect(data?.[0]?.total_count).toBe(6);
    });

    it("mode 'all' krever at alle termene treffer", async () => {
      const both = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "all", terms: ["sykkel", "tommer"] }],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(both.error).toBeNull();
      expect(titlesOf(both.data)).toEqual([titles.terrengsykkel]);

      const any = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "any", terms: ["sykkel", "tommer"] }],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(any.error).toBeNull();
      expect(titlesOf(any.data)).toEqual([titles.terrengsykkel, titles.testsykkel].sort());
    });

    it("flere grupper er AND-et, selv om forhåndsfilteret bruker unionen av termene", async () => {
      // Unionen {sykkel, tommer} slipper begge sykkel-annonsene gjennom
      // forhåndsfilteret; AND-et mellom gruppene må fjerne "Testsykkel" etterpå.
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [
          { mode: "any", terms: ["sykkel"] },
          { mode: "any", terms: ["tommer"] },
        ],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toEqual([titles.terrengsykkel]);
    });

    it("en tom 'all'-gruppe er vakuost sann og filtrerer ikke bort noe", async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [
          { mode: "all", terms: [] },
          { mode: "any", terms: ["sykkel"] },
        ],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toEqual([titles.terrengsykkel, titles.testsykkel].sort());
    });

    it("ekskludering virker sammen med inkludering: 'sykkel' uten 'terreng'", async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "any", terms: ["sykkel"] }],
        _exclude_any_terms: ["terreng"],
        _category_ids: [categoryId],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toEqual([titles.testsykkel]);
    });

    it("ekskludering alene overekskluderer ikke: '-ski' beholder 'Sko'", async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _category_ids: [categoryId],
        _exclude_any_terms: ["ski"],
        _sort: "new",
      });
      expect(error).toBeNull();
      expect(titlesOf(data)).toContain(titles.sko);
    });

    it("total_count teller hele treffmengden, ikke bare siden", async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _include_groups: [{ mode: "any", terms: ["sykkel"] }],
        _category_ids: [categoryId],
        _sort: "price_asc",
        _limit: 1,
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.total_count).toBe(2);
      expect(data?.[0]?.title).toBe(titles.testsykkel);
    });
  },
);
