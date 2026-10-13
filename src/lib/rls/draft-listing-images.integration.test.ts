/** RLS integration tests: sync_draft_listing_images. Run via `bun run test:rls`. */
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

type SyncImage = { id: string; storage_path: string; sort_order: number; caption: string | null };

describe.skipIf(!canRun)("RLS: sync_draft_listing_images", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-draft-img-seller-${suffix}@example.com`,
    other: `rls-draft-img-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let sellerId: string;
  let otherId: string;

  const createDraft = async () => {
    const { data, error } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "RLS utkast med bilder", status: "draft" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  const image = (listingId: string, sortOrder: number, caption: string | null = null) => ({
    id: crypto.randomUUID(),
    storage_path: `${listingId}/${crypto.randomUUID()}.webp`,
    sort_order: sortOrder,
    caption,
  });
  const sync = (listingId: string, userId: string, images: SyncImage[]) =>
    admin.rpc("sync_draft_listing_images", {
      _listing_id: listingId,
      _user_id: userId,
      _images: images,
    });
  const rows = async (listingId: string) => {
    const { data, error } = await admin
      .from("listing_images")
      .select("id, storage_path, sort_order, caption")
      .eq("listing_id", listingId)
      .order("sort_order");
    if (error) throw error;
    return data;
  };

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, emails.seller, userIds);
    otherId = await createRlsUser(admin, emails.other, userIds);
  });

  afterAll(async () => {
    await admin.from("listings").delete().in("seller_id", userIds);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("knytter bilder til utkastet og følger rekkefølge, bildetekst og fjerning", async () => {
    const listingId = await createDraft();
    const [a, b, c] = [image(listingId, 0), image(listingId, 1), image(listingId, 2)];

    const first = await sync(listingId, sellerId, [a, b, c]);
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ already_published: false });
    expect((await rows(listingId)).map((row) => row.id)).toEqual([a.id, b.id, c.id]);

    // Ny rekkefølge, ny bildetekst og b fjernet.
    const second = await sync(listingId, sellerId, [
      { ...c, sort_order: 0, caption: "Forside" },
      { ...a, sort_order: 1 },
    ]);
    expect(second.error).toBeNull();
    expect(await rows(listingId)).toEqual([
      { ...c, sort_order: 0, caption: "Forside" },
      { ...a, sort_order: 1 },
    ]);
  });

  it("nekter andre brukere og lar bildene stå", async () => {
    const listingId = await createDraft();
    const kept = image(listingId, 0);
    expect((await sync(listingId, sellerId, [kept])).error).toBeNull();

    const { error } = await sync(listingId, otherId, []);
    expect(error?.code).toBe("42501");
    expect((await rows(listingId)).map((row) => row.id)).toEqual([kept.id]);
  });

  it("avviser bildereferanser som tilhører en annen annonse", async () => {
    const listingId = await createDraft();
    const otherListingId = await createDraft();
    const foreign = image(otherListingId, 0);
    expect((await sync(otherListingId, sellerId, [foreign])).error).toBeNull();

    const { error } = await sync(listingId, sellerId, [foreign]);
    expect(error?.message).toContain("Ugyldig bildereferanse");
    expect(await rows(listingId)).toEqual([]);
  });

  it("publisering gjenbruker utkastets bilder, og en sen synk endrer ingenting", async () => {
    const listingId = await createDraft();
    const images = [image(listingId, 0, "Front"), image(listingId, 1)];
    expect((await sync(listingId, sellerId, images)).error).toBeNull();

    const { data: published, error: publishError } = await admin.rpc("publish_listing_draft", {
      _listing_id: listingId,
      _user_id: sellerId,
      _fields: { title: "RLS utkast med bilder", description: "Publisert", price_nok: 100 },
      _images: images,
    });
    expect(publishError).toBeNull();
    expect(published).toMatchObject({ id: listingId, already_published: false });
    expect(await rows(listingId)).toEqual(images);

    const late = await sync(listingId, sellerId, []);
    expect(late.error).toBeNull();
    expect(late.data).toEqual({ already_published: true });
    expect(await rows(listingId)).toEqual(images);
  });

  it("nekter klienter å kalle funksjonene", async () => {
    const listingId = await createDraft();
    const clients = [createClient(URL!, ANON_KEY!), await signInWithRetry(emails.seller)];
    for (const client of clients) {
      for (const [name, args] of [
        ["sync_draft_listing_images", { _listing_id: listingId, _user_id: sellerId, _images: [] }],
        ["sync_listing_images", { _listing_id: listingId, _images: [] }],
        ["lock_listing_draft_for_user", { _listing_id: listingId, _user_id: sellerId }],
      ] as const) {
        const { error } = await client.rpc(name as never, args as never);
        expect(error, name).not.toBeNull();
      }
    }
  });
});
