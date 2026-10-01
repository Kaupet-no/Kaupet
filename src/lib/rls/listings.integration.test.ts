/** RLS integration tests: listings. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  signInWithRetry,
  grantAdmin,
  registerCategoryCleanup,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("RLS: listings — draft visibility and owner-only writes", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-listing-seller-${suffix}@example.com`,
    other: `rls-listing-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  const listingIds: string[] = [];
  let sellerId: string;
  let draftListingId: string;
  let activeListingId: string;
  let disabledListingId: string;

  async function signIn(email: string) {
    return signInWithRetry(email);
  }

  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    sellerId = await mkUser(emails.seller);
    await mkUser(emails.other);

    const mkListing = async (status: "draft" | "active" | "disabled") => {
      const { data, error } = await admin
        .from("listings")
        .insert({ seller_id: sellerId, title: `RLS ${status} listing`, price_nok: 100, status })
        .select("id")
        .single();
      if (error) throw error;
      listingIds.push(data.id);
      return data.id;
    };
    draftListingId = await mkListing("draft");
    activeListingId = await mkListing("active");
    disabledListingId = await mkListing("disabled");
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets the owner see their own draft and disabled listings", async () => {
    const seller = await signIn(emails.seller);
    const { data } = await seller
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(new Set(data?.map((l) => l.id))).toEqual(
      new Set([draftListingId, activeListingId, disabledListingId]),
    );
  });

  it("hides drafts and shows only active listings to other users", async () => {
    const other = await signIn(emails.other);
    const { data } = await other
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(data?.map((l) => l.id)).toEqual([activeListingId]);
  });

  it("hides drafts and disabled listings from anonymous visitors", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data } = await anon
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(data?.map((l) => l.id)).toEqual([activeListingId]);
  });

  it("blocks a non-owner from updating someone else's listing", async () => {
    const other = await signIn(emails.other);
    const { error, count } = await other
      .from("listings")
      .update({ title: "Hijacked title" }, { count: "exact" })
      .eq("id", activeListingId);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("blocks the owner from re-activating an admin-disabled listing", async () => {
    const seller = await signIn(emails.seller);
    const { error } = await seller
      .from("listings")
      .update({ status: "active" }, { count: "exact" })
      .eq("id", disabledListingId);
    expect(error).not.toBeNull();

    const { data: check } = await admin
      .from("listings")
      .select("status")
      .eq("id", disabledListingId)
      .single();
    expect(check?.status).toBe("disabled");
  });
});

describe.skipIf(!canRun)(
  "RLS: owner can delete their own active, categorized listing (regression for 20260622120000/20260624120000 stats triggers)",
  () => {
    // The AFTER DELETE stats trigger (listings_remove_category_word_stats)
    // only fires its internal UPDATE when
    // the deleted listing had counted_category_id/counted_lexemes set —
    // which only happens for an *active, categorized* listing (see the
    // BEFORE trigger's `IF NEW.status = 'active' AND NEW.category_id IS NOT
    // NULL` guard in 20260622120000_category_word_stats.sql). A draft or
    // uncategorized listing wouldn't exercise this path at all, so this
    // test deliberately goes through the app's real "publish" shape
    // (active status + a real category + a title with real words) rather
    // than the minimal fixtures used elsewhere in this file.
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = { seller: `rls-listing-delete-seller-${suffix}@example.com` };

    const userIds: string[] = [];
    let sellerId: string;
    let listingId: string;
    let categoryId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data: userData, error: userErr } = await admin.auth.admin.createUser({
        email: emails.seller,
        password: PASSWORD,
        email_confirm: true,
      });
      if (userErr) throw userErr;
      sellerId = userData.user!.id;
      userIds.push(sellerId);

      categoryId = await createTestCategory(admin, `delete-${suffix}`);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS delete-regression annonse med ord",
          price_nok: 100,
          status: "active",
          category_id: categoryId,
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      await admin.from("categories").delete().eq("id", categoryId);
    });

    it("lets the owner delete their own active, categorized listing without a trigger permission/RLS error", async () => {
      const seller = await signIn(emails.seller);
      const { error, count } = await seller
        .from("listings")
        .delete({ count: "exact" })
        .eq("id", listingId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_images follow their parent listing's active-or-owner visibility",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-img-seller-${suffix}@example.com`,
      other: `rls-img-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let draftListingId: string;
    let imagePath: string;
    let draftImageId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    // R2-migreringen: nøkkelen har ikke lenger uploader-id i seg
    // ({listingId}/{uuid}.{ext}, se validate_listing_image_reference i
    // 20260918220000_r2_storage_objects_validation_fixes.sql), og det finnes
    // ingen storage.objects-rad å opprette. Innsettingen gjøres derfor som
    // den innloggede selgeren (ikke admin/service-role) — akkurat slik
    // use-inline-listing-images.ts og ny-annonse.tsx faktisk setter inn rader
    // fra klienten — siden triggerens autorisasjonssjekk nå bruker
    // auth.uid(), som er NULL for en service-role-innsetting.
    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS image test draft listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      draftListingId = listing.id;

      const seller = await signIn(emails.seller);
      imagePath = `${draftListingId}/${crypto.randomUUID()}.jpg`;
      const { data: image, error: imageErr } = await seller
        .from("listing_images")
        .insert({ listing_id: draftListingId, storage_path: imagePath })
        .select("id")
        .single();
      if (imageErr) throw imageErr;
      draftImageId = image.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see images on their own draft listing", async () => {
      const seller = await signIn(emails.seller);
      const { data, error } = await seller
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides images on a draft listing from other users and anon", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const anon = createClient(URL!, ANON_KEY!);
      const { data: anonData, error: anonErr } = await anon
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(anonErr).toBeNull();
      expect(anonData).toHaveLength(0);
    });

    it("blocks a non-owner from adding images to someone else's listing", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(error).not.toBeNull();
    });

    // Regresjonsdekning for R2-migreringens nøkkelskjemabytte: dette er
    // nettopp bruddet som ikke ble fanget opp fordi enhetstestene mocker
    // databasen (se validate_listing_image_reference i
    // 20260918220000_r2_storage_objects_validation_fixes.sql). Kjører ekte
    // INSERT-er mot Postgres som den eide selgeren, ikke bare RLS-policyen på
    // tabellen (som slipper alle formater gjennom) — dette tester
    // trigger-funksjonens egen path-validering.
    it("accepts the new {listingId}/{uuid}.ext path but rejects malformed or mismatched ones", async () => {
      const seller = await signIn(emails.seller);

      const { error: okError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(okError).toBeNull();

      const { error: oldFormatError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${sellerId}/${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(oldFormatError).not.toBeNull();

      const { error: wrongListingError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
      });
      expect(wrongListingError).not.toBeNull();

      const { error: notUuidError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/not-a-uuid.jpg`,
      });
      expect(notUuidError).not.toBeNull();

      const { error: badExtError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.svg`,
      });
      expect(badExtError).not.toBeNull();

      // Forankret regex (20260918220000_r2_storage_objects_validation_fixes.sql):
      // et uventet tredje segment skal ikke slippe gjennom.
      const { error: extraSegmentError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg/noe`,
      });
      expect(extraSegmentError).not.toBeNull();
    });

    it("allows 100 images per listing and rejects image 101", async () => {
      const owner = await signIn(emails.seller);
      const { data: capListing, error: capListingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS image cap test listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (capListingErr) throw capListingErr;

      for (let i = 0; i < 100; i++) {
        const { error } = await owner.from("listing_images").insert({
          listing_id: capListing.id,
          storage_path: `${capListing.id}/${crypto.randomUUID()}.jpg`,
        });
        expect(error).toBeNull();
      }

      const { error: overCapError } = await owner.from("listing_images").insert({
        listing_id: capListing.id,
        storage_path: `${capListing.id}/${crypto.randomUUID()}.jpg`,
      });
      expect(overCapError).not.toBeNull();

      await admin.from("listings").delete().eq("id", capListing.id);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_360_frames follow their parent listing's active-or-owner visibility",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-360-seller-${suffix}@example.com`,
      other: `rls-360-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let draftListingId: string;
    let frameId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS 360 test draft listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      draftListingId = listing.id;

      const { data: frame, error: frameErr } = await admin
        .from("listing_360_frames")
        .insert({
          listing_id: draftListingId,
          storage_path: `rls-test-360/${suffix}.jpg`,
          frame_order: 0,
        })
        .select("id")
        .single();
      if (frameErr) throw frameErr;
      frameId = frame.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see 360 frames on their own draft listing", async () => {
      const seller = await signIn(emails.seller);
      const { data, error } = await seller
        .from("listing_360_frames")
        .select("id")
        .eq("id", frameId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides 360 frames on a draft listing from other users and anon (tightened in 20260802100000_*.sql to match listing_images)", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other.from("listing_360_frames").select("id").eq("id", frameId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      const anon = createClient(URL!, ANON_KEY!);
      const { data: anonData, error: anonErr } = await anon
        .from("listing_360_frames")
        .select("id")
        .eq("id", frameId);
      expect(anonErr).toBeNull();
      expect(anonData).toHaveLength(0);
    });

    it("blocks a non-owner from adding 360 frames to someone else's listing", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_360_frames").insert({
        listing_id: draftListingId,
        storage_path: `rls-hijack-360/${suffix}.jpg`,
        frame_order: 1,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_360_capture_sessions never leak to authenticated clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-360session-${suffix}@example.com`;
    const userIds: string[] = [];
    let sessionId: string;

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
      const userId = data.user!.id;
      userIds.push(userId);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: userId,
          title: "RLS 360 session test listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;

      const { data: session, error: sessionErr } = await admin
        .from("listing_360_capture_sessions")
        .insert({
          listing_id: listing.id,
          token: `rls-test-token-${suffix}-long-enough`,
          created_by: userId,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (sessionErr) throw sessionErr;
      sessionId = session.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns capture-session rows to their own creator via the client (server/service-role only)", async () => {
      const client = await signIn();
      const { data, error } = await client
        .from("listing_360_capture_sessions")
        .select("id")
        .eq("id", sessionId);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing view counting is server-only — the rate-limited RPC runs only from the trusted server function (service_role), never directly from anon/authenticated",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-views-owner-${suffix}@example.com`;
    const userIds: string[] = [];
    let listingId: string;

    async function signIn() {
      return signInWithRetry(email);
    }

    function keyHash(input: string) {
      return createHash("sha256").update(input).digest("hex");
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      const ownerId = data.user!.id;
      userIds.push(ownerId);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: ownerId,
          title: "RLS listing view test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("blocks direct table access to listing_view_totals and listing_view_rate_limits for anon and authenticated", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { error: totalsErr } = await anon
        .from("listing_view_totals")
        .select("total_views")
        .eq("listing_id", listingId);
      expect(totalsErr).not.toBeNull();

      const owner = await signIn();
      const { error: ownerTotalsErr } = await owner
        .from("listing_view_totals")
        .select("total_views")
        .eq("listing_id", listingId);
      expect(ownerTotalsErr).not.toBeNull();

      const { error: limitsErr } = await anon
        .from("listing_view_rate_limits")
        .insert({ listing_id: listingId, key_hash: keyHash(`anon-insert-${suffix}`) });
      expect(limitsErr).not.toBeNull();
    });

    it("blocks anon and authenticated from calling log_listing_view_rate_limited directly (server function only, via supabaseAdmin)", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { error: anonErr } = await anon.rpc("log_listing_view_rate_limited", {
        _listing_id: listingId,
        _key_hash: keyHash(`anon-direct-${suffix}`),
      });
      expect(anonErr).not.toBeNull();

      const owner = await signIn();
      const { error: ownerErr } = await owner.rpc("log_listing_view_rate_limited", {
        _listing_id: listingId,
        _key_hash: keyHash(`owner-direct-${suffix}`),
      });
      expect(ownerErr).not.toBeNull();
    });

    it("counts a view when called through the trusted server path (service_role, as listing-views.functions.ts does)", async () => {
      const { data, error } = await admin.rpc("log_listing_view_rate_limited", {
        _listing_id: listingId,
        _key_hash: keyHash(`server-${suffix}`),
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("rate-limits a second call with the same key within the same window", async () => {
      const hash = keyHash(`server-repeat-${suffix}`);
      await admin.rpc("log_listing_view_rate_limited", { _listing_id: listingId, _key_hash: hash });
      const { data, error } = await admin.rpc("log_listing_view_rate_limited", {
        _listing_id: listingId,
        _key_hash: hash,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("lets the owner read the aggregate count via listing_stats, never the raw tables", async () => {
      const owner = await signIn();
      const { data, error } = await owner.rpc("listing_stats", { _listing_id: listingId });
      expect(error).toBeNull();
      expect(Array.isArray(data) ? data[0]?.total_views : undefined).toBeGreaterThanOrEqual(1);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_view_events are readable only by admins, insertable only via the log_listing_view_rate_limited RPC",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-viewevents-admin-${suffix}@example.com`,
      other: `rls-viewevents-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let listingId: string;
    let eventId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      const adminId = await mkUser(emails.admin);
      const otherId = await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: otherId,
          title: "RLS view events test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: event, error: eventErr } = await admin
        .from("listing_view_events")
        .insert({ listing_id: listingId })
        .select("id")
        .single();
      if (eventErr) throw eventErr;
      eventId = event.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an admin read listing view events", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("listing_view_events")
        .select("id")
        .eq("id", eventId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides listing view events from a non-admin user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("listing_view_events")
        .select("id")
        .eq("id", eventId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks a client from inserting a view event directly (no client GRANT — log_listing_view_rate_limited RPC only)", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_view_events").insert({ listing_id: listingId });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("RLS: aktive salgsannonser krever pris", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const email = `rls-price-${Date.now()}@example.com`;
  let sellerId: string;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    sellerId = data.user!.id;
  });

  afterAll(async () => {
    if (sellerId) await admin.auth.admin.deleteUser(sellerId);
  });

  it("avviser aktiv ikke-gratis annonse uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS annonse uten pris",
      is_free: false,
      status: "active",
    });

    expect(error).not.toBeNull();
  });

  it("tillater aktiv gratisannonse uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS gratisannonse",
      is_free: true,
      status: "active",
    });

    expect(error).toBeNull();
  });

  it("tillater utkast uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS utkast uten pris",
      is_free: false,
      status: "draft",
    });

    expect(error).toBeNull();
  });

  it("tillater aktiv ikke-gratis annonse med pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS annonse med pris",
      is_free: false,
      price_nok: 100,
      status: "active",
    });

    expect(error).toBeNull();
  });
});

// R2-migreringen fjernet listing_images_read/_write/_delete,
// listing_360_frames_read, avatars_*, og message_attachments_participant_*
// (storage.objects-policyer, se
// 20260918210000_drop_dead_storage_object_policies.sql) — Supabase Storage
// er ikke lenger i bruk for noen av disse bucketene. Denne describe-blokken
// testet dem alle; se kommentaren over hver `it` for hvor beskyttelsen (om
// noen) flyttet.
describe.skipIf(!canRun)("RLS: listing-image upload authorization (K-2)", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-storage-seller-${suffix}@example.com`,
    outsider: `rls-storage-outsider-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let sellerId: string;
  let activeListingId: string;
  let draftListingId: string;

  async function signIn(email: string) {
    return signInWithRetry(email);
  }

  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    sellerId = await mkUser(emails.seller);
    await mkUser(emails.outsider);

    const { data: active, error: activeErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS storage active listing",
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (activeErr) throw activeErr;
    activeListingId = active.id;

    const { data: draft, error: draftErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS storage draft listing",
        price_nok: 100,
        status: "draft",
      })
      .select("id")
      .single();
    if (draftErr) throw draftErr;
    draftListingId = draft.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", [activeListingId, draftListingId]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  // Erstatter listing_images_write/_delete. can_upload_listing_image
  // (20260918100000_can_upload_listing_image.sql) er `security definer` og
  // kalles her direkte som selger/utenforstående, akkurat som
  // uploadListingImage/uploadListingImageThumb/deleteListingImage i
  // src/lib/storage.functions.ts gjør via RPC før de skriver til R2.
  //
  // TAPT DEKNING: listing_images_read (aktiv annonse offentlig lesbar, utkast
  // skjult for andre enn selger) har ingen erstatning. Annonsebilder ligger nå
  // i en offentlig R2-bucket (se publicImageUrl i src/lib/image-url.ts) og
  // serveres uten noen tilgangssjekk — hvem som helst med URL-en/nøkkelen kan
  // laste den ned, uavhengig av annonsens status. Dette er en bevisst
  // konsekvens av R2-migreringen (kode allerede ferdig i arbeidskopien), ikke
  // noe denne oppgaven kan gjenskape, men det bør vurderes separat om et
  // utkasts bilder skal være offentlig hentbare via en gjettbar/lekket URL.
  it("lets only the seller (not an outsider) upload/delete images for their listing", async () => {
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);

    const canUpload = async (client: SupabaseClient, listingId: string) => {
      const { data, error } = await client.rpc("can_upload_listing_image", {
        _listing_id: listingId,
      });
      expect(error).toBeNull();
      return data;
    };

    expect(await canUpload(seller, activeListingId)).toBe(true);
    expect(await canUpload(outsider, activeListingId)).toBe(false);
    expect(await canUpload(seller, draftListingId)).toBe(true);
    expect(await canUpload(outsider, draftListingId)).toBe(false);
  });

  // listing_360_frames_read hadde ingen skrivepolicy å erstatte (kun
  // service-role skriver, se capture-token-flyten i
  // vehicle-360.functions.ts). TAPT DEKNING: samme som over — lesing av
  // 360-frames er nå ubeskyttet offentlig R2, "hides a draft's" finnes ikke
  // lenger som en testbar egenskap.
  //
  // message_attachments_participant_read/_insert: skrivesiden er dekket av
  // src/lib/storage.functions.test.ts ("avviser en bruker som ikke er
  // deltaker i samtalen" under uploadMessageAttachment), lesesiden av samme
  // fils "utelater vedlegg fra en samtale brukeren ikke er deltaker i" under
  // signMessageAttachmentUrls — begge mot ekte deltakeroppslag mot
  // `conversations`, samme betingelse policyen krevde. Ingen dekning tapt.
  //
  // avatars_owner_insert/_update/_delete: eierskapssjekken er dekket av
  // storage.functions.test.ts ("bygger nøkkelen fra den innloggede brukerens
  // id, ikke klientinput" under uploadAvatarImage, og
  // deletePreviousAvatarImage sine tester). avatars_public_read trengte ingen
  // erstatning — avatars var alltid en offentlig bucket, ingen beskyttet
  // lesing gikk tapt.
});

// Deletes the categories created by createTestCategory() above. Registered last so
// it runs after the block-local afterAll hooks (see rls-test-helpers.ts).
registerCategoryCleanup();
