/** Databasetrigger for tall-/datoformat på listings.attributes (PB-4): eierens
 * direkte PostgREST-skriving skal ikke kunne omgå serverfunksjonenes kontroll.
 * Kjøres via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  createTestCategory,
  registerCategoryCleanup,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("DB: listings.attributes — tall- og datoformat", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-attr-format-seller-${suffix}@example.com`,
    other: `rls-attr-format-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  const listingIds: string[] = [];
  let sellerId: string;
  /** Hovedkategori med tallfeltet `km` og datofeltet `eu`. */
  let parentId: string;
  /** Underkategori som arver filtrene. */
  let childId: string;
  /** Kategori der `km` er fritekst. */
  let textCategoryId: string;

  async function mkListing(fields: Record<string, unknown>) {
    const { data, error } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "Formattest", price_nok: 100, ...fields })
      .select("id")
      .single();
    if (error) throw error;
    listingIds.push(data.id);
    return data.id as string;
  }

  async function attributesOf(id: string) {
    const { data } = await admin.from("listings").select("attributes").eq("id", id).single();
    return data!.attributes as Record<string, unknown>;
  }

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, emails.seller, userIds);
    await createRlsUser(admin, emails.other, userIds);
    parentId = await createTestCategory(admin, `attr-format-${suffix}`);
    childId = await createTestCategory(admin, `attr-format-child-${suffix}`);
    textCategoryId = await createTestCategory(admin, `attr-format-text-${suffix}`);
    const { error: parentError } = await admin
      .from("categories")
      .update({ parent_id: parentId })
      .eq("id", childId);
    if (parentError) throw parentError;
    const { error } = await admin.from("category_filters").insert([
      { category_id: parentId, key: "km", label_nb: "Kilometerstand", type: "number" },
      { category_id: parentId, key: "eu", label_nb: "Neste EU-kontroll", type: "date" },
      { category_id: textCategoryId, key: "km", label_nb: "Kilometerstand", type: "text" },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("avviser at eieren lagrer tekst i et arvet tallfelt", async () => {
    const id = await mkListing({
      status: "active",
      category_id: childId,
      attributes: { km: 1000 },
    });
    const seller = await signInWithRetry(emails.seller);
    const { error } = await seller
      .from("listings")
      .update({ attributes: { km: "mange" } })
      .eq("id", id);
    expect(error?.code).toBe("23514");
    expect(error?.message).toBe("Kilometerstand må være et tall.");
    expect(await attributesOf(id)).toEqual({ km: 1000 });
  });

  it.each(["31.12.2027", "2027-02-30", "2027-5-1", 20270531])(
    "avviser ugyldig dato %s fra eieren",
    async (eu) => {
      const id = await mkListing({ status: "active", category_id: childId, attributes: {} });
      const seller = await signInWithRetry(emails.seller);
      const { error } = await seller.from("listings").update({ attributes: { eu } }).eq("id", id);
      expect(error?.code).toBe("23514");
      expect(error?.message).toBe("Neste EU-kontroll må være en gyldig dato.");
    },
  );

  it("godtar gyldige verdier, null og tom dato fra eieren", async () => {
    const id = await mkListing({ status: "active", category_id: childId, attributes: {} });
    const seller = await signInWithRetry(emails.seller);
    for (const attributes of [
      { km: 12.5, eu: "2027-05-31" },
      { km: null, eu: "" },
    ]) {
      const { error } = await seller.from("listings").update({ attributes }).eq("id", id);
      expect(error).toBeNull();
      expect(await attributesOf(id)).toEqual(attributes);
    }
  });

  it("lar en eldre ugyldig verdi stå når andre felt redigeres", async () => {
    // Lagret mens `km` var fritekst; deretter ble filteret gjort om til tall.
    const id = await mkListing({
      status: "active",
      category_id: textCategoryId,
      attributes: { km: "gammel tekst" },
    });
    const { error: retypeError } = await admin
      .from("category_filters")
      .update({ type: "number" })
      .eq("category_id", textCategoryId)
      .eq("key", "km");
    expect(retypeError).toBeNull();
    try {
      const seller = await signInWithRetry(emails.seller);
      const { error } = await seller
        .from("listings")
        .update({ title: "Ny tittel", attributes: { km: "gammel tekst", farge: "rød" } })
        .eq("id", id);
      expect(error).toBeNull();
    } finally {
      await admin
        .from("category_filters")
        .update({ type: "text" })
        .eq("category_id", textCategoryId)
        .eq("key", "km");
    }
  });

  it("avviser kategoribytte som gjør en uendret verdi til et ugyldig tall", async () => {
    const id = await mkListing({
      status: "active",
      category_id: textCategoryId,
      attributes: { km: "mange" },
    });
    const seller = await signInWithRetry(emails.seller);
    const { error } = await seller.from("listings").update({ category_id: childId }).eq("id", id);
    expect(error?.message).toBe("Kilometerstand må være et tall.");
  });

  it("lagrer ugyldige verdier i utkast, men avviser publisering av dem", async () => {
    const id = await mkListing({ status: "draft", category_id: childId, attributes: {} });
    const seller = await signInWithRetry(emails.seller);
    const { error: draftError } = await seller
      .from("listings")
      .update({ attributes: { km: "150 000", eu: "31.12" } })
      .eq("id", id);
    expect(draftError).toBeNull();

    const { error: publishError } = await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", id);
    expect(publishError?.message).toBe("Kilometerstand må være et tall.");

    const { error: normalizedPublishError } = await admin
      .from("listings")
      .update({ status: "active", attributes: { km: 150000, eu: "2027-05-31" } })
      .eq("id", id);
    expect(normalizedPublishError).toBeNull();
  });

  it("validerer førstegangsregistrering uten filterrad, også for service-rollen", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "Formattest",
      price_nok: 100,
      status: "active",
      category_id: childId,
      attributes: { first_registration_date: "2020-13-01" },
    });
    expect(error?.message).toBe("Førstegangsregistrering må være en gyldig dato.");

    await expect(
      mkListing({
        status: "active",
        category_id: childId,
        attributes: { first_registration_date: "2020-01-15", km: 1000 },
      }),
    ).resolves.toBeTruthy();
  });

  it("lar ikke andre innloggede eller anonyme skrive attributter", async () => {
    const id = await mkListing({ status: "active", category_id: childId, attributes: { km: 1 } });
    const other = await signInWithRetry(emails.other);
    const anon = createClient(URL!, ANON_KEY!);
    for (const client of [other, anon]) {
      const { count } = await client
        .from("listings")
        .update({ attributes: { km: 2 } }, { count: "exact" })
        .eq("id", id);
      expect(count ?? 0).toBe(0);
    }
    expect(await attributesOf(id)).toEqual({ km: 1 });
  });

  it("bruker barnekategoriens filtertype foran den arvede", async () => {
    const { error: overrideError } = await admin
      .from("category_filters")
      .insert({ category_id: childId, key: "km", label_nb: "Kilometerstand", type: "text" });
    expect(overrideError).toBeNull();
    const id = await mkListing({
      status: "active",
      category_id: childId,
      attributes: { km: "ca. 15 000" },
    });
    expect(await attributesOf(id)).toEqual({ km: "ca. 15 000" });
  });
});

registerCategoryCleanup();
