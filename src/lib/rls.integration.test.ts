/**
 * Representative RLS integration test — runs against a local Supabase stack.
 *
 * Setup:
 *   1. `supabase start` (requires Docker)
 *   2. `supabase status` to read the local API URL, anon key and service_role key
 *   3. Export them and run:
 *        LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *        LOCAL_SUPABASE_ANON_KEY=... \
 *        LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
 *        bun run test:rls
 *
 * This is one representative example (conversations/messages visibility),
 * not full RLS coverage. Use the same pattern — service-role setup, two
 * signed-in clients, assert who can/can't see what — for other tables.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

async function createTestCategory(admin: SupabaseClient, suffix: number | string) {
  const { data, error } = await admin
    .from("categories")
    .insert({ slug: `rls-category-${suffix}`, name_nb: "RLS testkategori" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** With ~14 test groups each signing in 2-4 users, a full run does 60+
 * password sign-ins in well under a minute — enough to trip Supabase auth's
 * per-project rate limit on staging. Retries with backoff on a rate-limit
 * response instead of failing the whole suite. */
async function signInWithRetry(email: string, attempt = 0): Promise<SupabaseClient> {
  const client = createClient(URL!, ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (!error) return client;
  const isRateLimited = error.status === 429 || /rate limit/i.test(error.message);
  if (isRateLimited && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return signInWithRetry(email, attempt + 1);
  }
  throw error;
}

describe.skipIf(!canRun)("RLS: conversations & messages are only visible to participants", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    buyer: `rls-buyer-${suffix}@example.com`,
    seller: `rls-seller-${suffix}@example.com`,
    outsider: `rls-outsider-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let conversationId: string;

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
    const buyerId = await mkUser(emails.buyer);
    const sellerId = await mkUser(emails.seller);
    await mkUser(emails.outsider);

    const { data: listing, error: listingErr } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "RLS test listing", price_nok: 100, status: "active" })
      .select("id")
      .single();
    if (listingErr) throw listingErr;

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ listing_id: listing.id, buyer_id: buyerId, seller_id: sellerId })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conversationId = conv.id;

    await admin
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: buyerId, body: "Hei, er den ledig?" });
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets a participant (buyer) read the conversation and its messages", async () => {
    const buyer = await signIn(emails.buyer);
    const { data: convs } = await buyer.from("conversations").select("id").eq("id", conversationId);
    expect(convs).toHaveLength(1);

    const { data: messages } = await buyer
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages).toHaveLength(1);
  });

  it("hides the conversation and its messages from an unrelated user", async () => {
    const outsider = await signIn(emails.outsider);
    const { data: convs } = await outsider
      .from("conversations")
      .select("id")
      .eq("id", conversationId);
    expect(convs).toHaveLength(0);

    const { data: messages } = await outsider
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages).toHaveLength(0);
  });

  it("rejects a message body over 4000 characters (M-7)", async () => {
    const buyer = await signIn(emails.buyer);
    const {
      data: { user: buyerUser },
    } = await buyer.auth.getUser();
    const { error } = await buyer.from("messages").insert({
      conversation_id: conversationId,
      sender_id: buyerUser!.id,
      body: "x".repeat(4001),
    });
    expect(error).not.toBeNull();

    const { error: okError } = await buyer.from("messages").insert({
      conversation_id: conversationId,
      sender_id: buyerUser!.id,
      body: "x".repeat(4000),
    });
    expect(okError).toBeNull();
  });

  it("rejects a display_name over 80 characters (M-7)", async () => {
    const buyer = await signIn(emails.buyer);
    const {
      data: { user: buyerUser },
    } = await buyer.auth.getUser();
    const { error } = await buyer
      .from("profiles")
      .update({ display_name: "x".repeat(81) })
      .eq("id", buyerUser!.id);
    expect(error).not.toBeNull();

    const { error: okError } = await buyer
      .from("profiles")
      .update({ display_name: "x".repeat(80) })
      .eq("id", buyerUser!.id);
    expect(okError).toBeNull();
  });
  it("lar hver deltaker flytte sin egen samtale til papirkurven og gjenopprette den", async () => {
    const buyer = await signIn(emails.buyer);
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const { data: buyerUser } = await buyer.auth.getUser();

    const { error: deleteError, count: deleteCount } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", conversationId);
    expect(deleteError).toBeNull();
    expect(deleteCount).toBe(1);

    const { data: buyerInbox } = await buyer
      .from("conversations")
      .select("id")
      .or(
        `and(buyer_id.eq.${buyerUser.user!.id},buyer_deleted_at.is.null),and(seller_id.eq.${buyerUser.user!.id},seller_deleted_at.is.null)`,
      )
      .eq("id", conversationId);
    expect(buyerInbox).toHaveLength(0);

    const { data: buyerTrash } = await buyer
      .from("conversations")
      .select("id, buyer_deleted_at")
      .eq("id", conversationId)
      .not("buyer_deleted_at", "is", null);
    expect(buyerTrash).toHaveLength(1);

    const { data: sellerInbox } = await seller
      .from("conversations")
      .select("id")
      .eq("id", conversationId);
    expect(sellerInbox).toHaveLength(1);

    const { error: outsiderError, count: outsiderCount } = await outsider
      .from("conversations")
      .update({ buyer_deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", conversationId);
    expect(outsiderError).toBeNull();
    expect(outsiderCount).toBe(0);

    const { error: restoreError, count: restoreCount } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: null }, { count: "exact" })
      .eq("id", conversationId);
    expect(restoreError).toBeNull();
    expect(restoreCount).toBe(1);
    const expiredAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { error: expireError } = await admin
      .from("conversations")
      .update({ buyer_deleted_at: expiredAt })
      .eq("id", conversationId);
    expect(expireError).toBeNull();

    const { data: expiredTrash } = await buyer
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .gte("buyer_deleted_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
    expect(expiredTrash).toHaveLength(0);

    const { error: expiredRestoreError } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: null })
      .eq("id", conversationId);
    expect(expiredRestoreError).not.toBeNull();

    await admin.from("conversations").update({ buyer_deleted_at: null }).eq("id", conversationId);
  });
});

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
    const { error, count } = await seller
      .from("listings")
      .update({ status: "active" }, { count: "exact" })
      .eq("id", disabledListingId);
    expect(error).toBeNull();
    expect(count).toBe(0);

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
    // The AFTER DELETE stats triggers (listings_remove_category_word_stats,
    // listings_remove_keyword_stats) only fire their internal UPDATE when
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

describe.skipIf(!canRun)("RLS: profiles — soft-deleted profiles are hidden from others", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    deleted: `rls-profile-deleted-${suffix}@example.com`,
    other: `rls-profile-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let deletedUserId: string;

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
    deletedUserId = await mkUser(emails.deleted);
    await mkUser(emails.other);

    const { error } = await admin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deletedUserId);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("hides a soft-deleted profile from other users", async () => {
    const other = await signIn(emails.other);
    const { data } = await other.from("profiles").select("id").eq("id", deletedUserId);
    expect(data).toHaveLength(0);
  });

  it("still lets the owner see their own soft-deleted profile", async () => {
    const deleted = await signIn(emails.deleted);
    const { data } = await deleted.from("profiles").select("id").eq("id", deletedUserId);
    expect(data).toHaveLength(1);
  });
});

describe.skipIf(!canRun)("RLS: favorites are private to their owner", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-fav-owner-${suffix}@example.com`,
    seller: `rls-fav-seller-${suffix}@example.com`,
    other: `rls-fav-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let ownerId: string;
  let listingId: string;

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
    ownerId = await mkUser(emails.owner);
    const sellerId = await mkUser(emails.seller);
    await mkUser(emails.other);

    const { data: listing, error: listingErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS favorite test listing",
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (listingErr) throw listingErr;
    listingId = listing.id;

    const { error } = await admin
      .from("favorites")
      .insert({ user_id: ownerId, listing_id: listingId });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets the owner see their own favorite", async () => {
    const owner = await signIn(emails.owner);
    const { data, error } = await owner
      .from("favorites")
      .select("listing_id")
      .eq("listing_id", listingId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides another user's favorites from an unrelated user", async () => {
    const other = await signIn(emails.other);
    const { data, error } = await other
      .from("favorites")
      .select("listing_id")
      .eq("listing_id", listingId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("blocks inserting a favorite on someone else's behalf", async () => {
    const other = await signIn(emails.other);
    const { error } = await other
      .from("favorites")
      .insert({ user_id: ownerId, listing_id: listingId });
    expect(error).not.toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: saved_searches are private to their owner", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-search-owner-${suffix}@example.com`,
    other: `rls-search-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let ownerId: string;
  let savedSearchId: string;

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
    ownerId = await mkUser(emails.owner);
    await mkUser(emails.other);

    const { data, error } = await admin
      .from("saved_searches")
      .insert({ user_id: ownerId, name: "RLS test search", criteria: {} })
      .select("id")
      .single();
    if (error) throw error;
    savedSearchId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets the owner see and update their own saved search", async () => {
    const owner = await signIn(emails.owner);
    const { data, error } = await owner.from("saved_searches").select("id").eq("id", savedSearchId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { error: updateError, count } = await owner
      .from("saved_searches")
      .update({ name: "Updated name" }, { count: "exact" })
      .eq("id", savedSearchId);
    expect(updateError).toBeNull();
    expect(count).toBe(1);
  });

  it("hides another user's saved search and blocks updating it", async () => {
    const other = await signIn(emails.other);
    const { data, error } = await other.from("saved_searches").select("id").eq("id", savedSearchId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { error: updateError, count } = await other
      .from("saved_searches")
      .update({ name: "Hijacked" }, { count: "exact" })
      .eq("id", savedSearchId);
    expect(updateError).toBeNull();
    expect(count).toBe(0);
  });
});

describe.skipIf(!canRun)(
  "RLS: saved_search_notifications are visible only to their owner, never insertable by clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-ssn-owner-${suffix}@example.com`,
      seller: `rls-ssn-seller-${suffix}@example.com`,
      other: `rls-ssn-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let searchId: string;
    let listingId: string;
    let secondListingId: string;
    let notificationId: string;

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
      ownerId = await mkUser(emails.owner);
      const sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);

      // notify: false — otherwise inserting the active listing below fires
      // listings_match_saved_searches, which matches this search's empty
      // (unfiltered) criteria and auto-inserts the same notification row via
      // the DB trigger, racing the manual insert further down and tripping
      // the (saved_search_id, listing_id) unique constraint.
      const { data: search, error: searchErr } = await admin
        .from("saved_searches")
        .insert({ user_id: ownerId, name: "RLS ssn test search", criteria: {}, notify: false })
        .select("id")
        .single();
      if (searchErr) throw searchErr;
      searchId = search.id;

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS ssn test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: notif, error: notifErr } = await admin
        .from("saved_search_notifications")
        .insert({ saved_search_id: searchId, user_id: ownerId, listing_id: listingId })
        .select("id")
        .single();
      if (notifErr) throw notifErr;
      notificationId = notif.id;

      // Second listing so the insert-blocked test below uses a real,
      // not-yet-notified (search, listing) pair — proving the insert is
      // rejected for lacking an INSERT grant/policy, not because of a
      // foreign-key or unique-constraint violation.
      const { data: listing2, error: listing2Err } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS ssn test listing 2",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listing2Err) throw listing2Err;
      secondListingId = listing2.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see their own notification", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("saved_search_notifications")
        .select("id")
        .eq("id", notificationId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides the notification from an unrelated user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("saved_search_notifications")
        .select("id")
        .eq("id", notificationId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks clients from inserting notifications directly (server-only via SECURITY DEFINER function)", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner.from("saved_search_notifications").insert({
        saved_search_id: searchId,
        user_id: ownerId,
        listing_id: secondListingId,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("Saved search matches persisted attributes before notifying", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-attribute-search-owner-${suffix}@example.com`,
    seller: `rls-attribute-search-seller-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let ownerId: string;
  let searchId: string;

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

    ownerId = await createUser(emails.owner);
    const sellerId = await createUser(emails.seller);
    const { data, error } = await admin
      .from("saved_searches")
      .insert({
        user_id: ownerId,
        name: "RLS attribute search",
        notify: true,
        criteria: {
          attributes: {
            fuel_type: { kind: "select", value: "electric" },
          },
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    searchId = data.id;

    const { error: matchingError } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS electric listing",
      price_nok: 100,
      status: "active",
      attributes: { fuel_type: "electric" },
    });
    if (matchingError) throw matchingError;

    const { error: nonMatchingError } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS diesel listing",
      price_nok: 100,
      status: "active",
      attributes: { fuel_type: "diesel" },
    });
    if (nonMatchingError) throw nonMatchingError;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("notifies only for the listing matching the saved attribute", async () => {
    const { data, error } = await admin
      .from("saved_search_notifications")
      .select("listing_id, listings!inner(title)")
      .eq("saved_search_id", searchId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.listings).toMatchObject({ title: "RLS electric listing" });
  });
});

describe.skipIf(!canRun)("RLS: push_subscriptions are private to their owner", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-push-owner-${suffix}@example.com`,
    other: `rls-push-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let ownerId: string;
  let subscriptionId: string;

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
    ownerId = await mkUser(emails.owner);
    await mkUser(emails.other);

    const { data, error } = await admin
      .from("push_subscriptions")
      .insert({
        user_id: ownerId,
        endpoint: `https://push.example.com/${suffix}`,
        p256dh: "test-p256dh",
        auth: "test-auth",
      })
      .select("id")
      .single();
    if (error) throw error;
    subscriptionId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets the owner see and delete their own subscription", async () => {
    const owner = await signIn(emails.owner);
    const { data, error } = await owner
      .from("push_subscriptions")
      .select("id")
      .eq("id", subscriptionId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides another user's subscription and blocks deleting it", async () => {
    const other = await signIn(emails.other);
    const { data, error } = await other
      .from("push_subscriptions")
      .select("id")
      .eq("id", subscriptionId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { error: deleteError, count } = await other
      .from("push_subscriptions")
      .delete({ count: "exact" })
      .eq("id", subscriptionId);
    expect(deleteError).toBeNull();
    expect(count).toBe(0);

    const { data: check } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("id", subscriptionId)
      .single();
    expect(check).not.toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: notification_preferences are private to their owner", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-np-owner-${suffix}@example.com`,
    other: `rls-np-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let ownerId: string;

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
    ownerId = await mkUser(emails.owner);
    await mkUser(emails.other);

    const { error } = await admin
      .from("notification_preferences")
      .insert({ user_id: ownerId, web_push_messages: true });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets the owner see and update their own preferences", async () => {
    const owner = await signIn(emails.owner);
    const { data, error } = await owner
      .from("notification_preferences")
      .select("user_id")
      .eq("user_id", ownerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { error: updateError, count } = await owner
      .from("notification_preferences")
      .update({ web_push_messages: false }, { count: "exact" })
      .eq("user_id", ownerId);
    expect(updateError).toBeNull();
    expect(count).toBe(1);
  });

  it("hides another user's preferences and blocks updating them", async () => {
    const other = await signIn(emails.other);
    const { data, error } = await other
      .from("notification_preferences")
      .select("user_id")
      .eq("user_id", ownerId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { error: updateError, count } = await other
      .from("notification_preferences")
      .update({ web_push_messages: false }, { count: "exact" })
      .eq("user_id", ownerId);
    expect(updateError).toBeNull();
    expect(count).toBe(0);
  });
});

describe.skipIf(!canRun)(
  "RLS: user_blocks are visible only to the blocker, blockee cannot see who blocked them",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      blocker: `rls-block-blocker-${suffix}@example.com`,
      blocked: `rls-block-blocked-${suffix}@example.com`,
      other: `rls-block-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let blockerId: string;
    let blockedId: string;
    let blockRowId: string;

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
      blockerId = await mkUser(emails.blocker);
      blockedId = await mkUser(emails.blocked);
      await mkUser(emails.other);

      const { data, error } = await admin
        .from("user_blocks")
        .insert({ blocker_id: blockerId, blocked_id: blockedId, scope: "all" })
        .select("id")
        .single();
      if (error) throw error;
      blockRowId = data.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the blocker see their own block", async () => {
      const blocker = await signIn(emails.blocker);
      const { data, error } = await blocker.from("user_blocks").select("id").eq("id", blockRowId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides the block from the blocked user (they shouldn't learn they were blocked via direct query)", async () => {
      const blocked = await signIn(emails.blocked);
      const { data, error } = await blocked.from("user_blocks").select("id").eq("id", blockRowId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks an unrelated user from inserting a block on someone else's behalf", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("user_blocks")
        .insert({ blocker_id: blockerId, blocked_id: blockedId, scope: "all" });
      expect(error).not.toBeNull();
    });
  },
);

async function grantAdmin(admin: SupabaseClient, userId: string) {
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
  if (error) throw error;
}

describe.skipIf(!canRun)(
  "RLS: user_bans — users see only their own ban, only admins can ban",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-ban-admin-${suffix}@example.com`,
      banned: `rls-ban-banned-${suffix}@example.com`,
      other: `rls-ban-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let adminId: string;
    let bannedId: string;

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
      adminId = await mkUser(emails.admin);
      bannedId = await mkUser(emails.banned);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { error } = await admin
        .from("user_bans")
        .insert({ user_id: bannedId, reason: "RLS test ban", banned_by: adminId });
      if (error) throw error;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the banned user see their own ban", async () => {
      const banned = await signIn(emails.banned);
      const { data, error } = await banned
        .from("user_bans")
        .select("user_id")
        .eq("user_id", bannedId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides the ban from an unrelated non-admin user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("user_bans")
        .select("user_id")
        .eq("user_id", bannedId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("lets an admin see any user's ban", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("user_bans")
        .select("user_id")
        .eq("user_id", bannedId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("blocks a non-admin from banning another user", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("user_bans")
        .insert({ user_id: bannedId, reason: "self-service ban attempt", banned_by: bannedId });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: user_suspensions — users see only their own, only admins can suspend",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-susp-admin-${suffix}@example.com`,
      suspended: `rls-susp-suspended-${suffix}@example.com`,
      other: `rls-susp-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let adminId: string;
    let suspendedId: string;

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
      adminId = await mkUser(emails.admin);
      suspendedId = await mkUser(emails.suspended);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { error } = await admin.from("user_suspensions").insert({
        user_id: suspendedId,
        reason: "RLS test suspension",
        suspended_by: adminId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the suspended user see their own suspension", async () => {
      const suspended = await signIn(emails.suspended);
      const { data, error } = await suspended
        .from("user_suspensions")
        .select("user_id")
        .eq("user_id", suspendedId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides the suspension from an unrelated non-admin user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("user_suspensions")
        .select("user_id")
        .eq("user_id", suspendedId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks a non-admin from suspending another user", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("user_suspensions").insert({
        user_id: suspendedId,
        reason: "self-service suspension attempt",
        suspended_by: suspendedId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: ip_bans are visible only to admins (via the 'Admins manage ip_bans' policy)",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-ipban-admin-${suffix}@example.com`,
      other: `rls-ipban-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ipBanId: string;

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
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { data, error } = await admin
        .from("ip_bans")
        .insert({
          ip_address: `203.0.113.${suffix % 255}`,
          reason: "RLS test ip ban",
          banned_by: adminId,
        })
        .select("id")
        .single();
      if (error) throw error;
      ipBanId = data.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an admin see ip bans directly", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient.from("ip_bans").select("id").eq("id", ipBanId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides ip bans from a non-admin user (RLS default-deny, no matching policy)", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other.from("ip_bans").select("id").eq("id", ipBanId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: reports — reporters can only submit their own, only admins/moderators can read",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-report-admin-${suffix}@example.com`,
      reporter: `rls-report-reporter-${suffix}@example.com`,
      seller: `rls-report-seller-${suffix}@example.com`,
      other: `rls-report-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let adminId: string;
    let reporterId: string;
    let listingId: string;
    let reportId: string;

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
      adminId = await mkUser(emails.admin);
      reporterId = await mkUser(emails.reporter);
      const sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS report test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .insert({ listing_id: listingId, reporter_id: reporterId, reason: "RLS test reason" })
        .select("id")
        .single();
      if (reportErr) throw reportErr;
      reportId = report.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets a user submit their own report", async () => {
      const reporter = await signIn(emails.reporter);
      const { error } = await reporter
        .from("reports")
        .insert({ listing_id: listingId, reporter_id: reporterId, reason: "Second report" });
      expect(error).toBeNull();
    });

    it("blocks a user from submitting a report on someone else's behalf", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("reports")
        .insert({ listing_id: listingId, reporter_id: reporterId, reason: "Impersonated report" });
      expect(error).not.toBeNull();
    });

    it("hides reports from a regular user, even the reporter's own", async () => {
      const reporter = await signIn(emails.reporter);
      const { data, error } = await reporter.from("reports").select("id").eq("id", reportId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("lets an admin see all reports", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient.from("reports").select("id").eq("id", reportId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  },
);

describe.skipIf(!canRun)(
  // The public-read policy ("Anyone can read active promotions") was dropped
  // in 20260608194322_*.sql without a replacement — public "featured
  // listing" visibility now goes exclusively through the SECURITY DEFINER
  // get_featured_listing_ids() RPC, not a direct table SELECT. Only the
  // owner (and admins, via a separate policy) can read this table directly.
  "RLS: listing_promotions — only owner/admin can read, no public/anon access",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-promo-owner-${suffix}@example.com`,
      other: `rls-promo-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let pendingPromoId: string;
    let activePromoId: string;

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
      ownerId = await mkUser(emails.owner);
      await mkUser(emails.other);

      const mkListing = async (title: string) => {
        const { data, error } = await admin
          .from("listings")
          .insert({ seller_id: ownerId, title, price_nok: 100, status: "active" })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      };
      const pendingListingId = await mkListing("RLS promo pending listing");
      const activeListingId = await mkListing("RLS promo active listing");

      const { data: pending, error: pendingErr } = await admin
        .from("listing_promotions")
        .insert({
          listing_id: pendingListingId,
          user_id: ownerId,
          duration_days: 3,
          price_nok: 49,
          status: "pending",
        })
        .select("id")
        .single();
      if (pendingErr) throw pendingErr;
      pendingPromoId = pending.id;

      const { data: active, error: activeErr } = await admin
        .from("listing_promotions")
        .insert({
          listing_id: activeListingId,
          user_id: ownerId,
          duration_days: 3,
          price_nok: 49,
          status: "active",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (activeErr) throw activeErr;
      activePromoId = active.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see both their pending and active promotion", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(new Set(data?.map((p) => p.id))).toEqual(new Set([pendingPromoId, activePromoId]));
    });

    it("hides both promotions from an unrelated non-admin user, active included", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("hides both promotions from anonymous visitors, active included", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: vipps_webhook_secrets and vipps_webhook_events never leak to authenticated clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-vipps-${suffix}@example.com`;
    const userIds: string[] = [];
    let webhookEventId: string;

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

      const { data: event, error: eventErr } = await admin
        .from("vipps_webhook_events")
        .insert({
          event_id: `rls-test-event-${suffix}`,
          reference: "rls-test",
          event_name: "test.event",
          payload: {},
        })
        .select("id")
        .single();
      if (eventErr) throw eventErr;
      webhookEventId = event.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("vipps_webhook_events").delete().eq("id", webhookEventId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns vipps_webhook_secrets rows to a regular authenticated client", async () => {
      // Doesn't insert its own row — vipps_webhook_secrets holds real
      // production webhook config, not test-safe to write to. Verified
      // instead against whatever real rows already exist (any environment
      // running Vipps promotions has at least one).
      const client = await signIn();
      const { data, error } = await client.from("vipps_webhook_secrets").select("id");
      // Either outcome is acceptable — a grant-level permission error, or an
      // empty result from RLS default-deny (this table has zero policies).
      // What must never happen is `data` containing any real rows.
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data?.length ?? 0).toBe(0);
      }
    });

    it("never returns vipps_webhook_events rows to a non-admin authenticated client", async () => {
      const client = await signIn();
      const { data, error } = await client
        .from("vipps_webhook_events")
        .select("id")
        .eq("id", webhookEventId);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_sales — visible only to participants, only seller can confirm/undo",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-sale-seller-${suffix}@example.com`,
      buyer: `rls-sale-buyer-${suffix}@example.com`,
      other: `rls-sale-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let buyerId: string;
    let otherId: string;
    let listingId: string;
    let conversationId: string;

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
      buyerId = await mkUser(emails.buyer);
      otherId = await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS sale test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = conv.id;

      const { error: saleErr } = await admin.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: sellerId,
        buyer_id: buyerId,
        conversation_id: conversationId,
      });
      if (saleErr) throw saleErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets both the buyer and seller see the confirmed sale", async () => {
      const seller = await signIn(emails.seller);
      const { data: sellerData, error: sellerErr } = await seller
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(sellerErr).toBeNull();
      expect(sellerData).toHaveLength(1);

      const buyer = await signIn(emails.buyer);
      const { data: buyerData, error: buyerErr } = await buyer
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(buyerErr).toBeNull();
      expect(buyerData).toHaveLength(1);
    });

    it("hides the sale from an unrelated authenticated user and from anon", async () => {
      const other = await signIn(emails.other);
      const { data: otherData, error: otherErr } = await other
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(otherErr).toBeNull();
      expect(otherData).toHaveLength(0);

      const anon = createClient(URL!, ANON_KEY!);
      const { data: anonData, error: anonErr } = await anon
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(anonErr).toBeNull();
      expect(anonData).toHaveLength(0);
    });

    it("blocks a non-participant from confirming a sale using someone else's conversation", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: otherId,
        buyer_id: buyerId,
        conversation_id: conversationId,
      });
      expect(error).not.toBeNull();
    });

    it("blocks the buyer from undoing (deleting) the sale — only the seller can", async () => {
      const buyer = await signIn(emails.buyer);
      const { error, count } = await buyer
        .from("listing_sales")
        .delete({ count: "exact" })
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: user_reviews — readable by any authenticated user, writable only by the matching sale's participant",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-review-seller-${suffix}@example.com`,
      buyer: `rls-review-buyer-${suffix}@example.com`,
      other: `rls-review-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let buyerId: string;
    let listingId: string;

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
      buyerId = await mkUser(emails.buyer);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS review test listing",
          price_nok: 100,
          status: "sold",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();
      if (convErr) throw convErr;

      const { error: saleErr } = await admin.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: sellerId,
        buyer_id: buyerId,
        conversation_id: conv.id,
      });
      if (saleErr) throw saleErr;

      const { error: reviewErr } = await admin.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: buyerId,
        reviewee_id: sellerId,
        role: "buyer",
        rating: 5,
      });
      if (reviewErr) throw reviewErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets any authenticated user read the review, even an unrelated one", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("user_reviews")
        .select("id")
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("lets an anonymous visitor read the review too (reputation data is public)", async () => {
      // The SELECT policy went through two revisions: tightened to
      // `TO authenticated` in 20260605123044_*.sql, then reopened to
      // everyone (including anon, with a matching GRANT) in
      // 20260610102257_*.sql — reviews are reputation data, meant to be
      // publicly visible like a seller's star rating.
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("user_reviews")
        .select("id")
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("blocks submitting a review that doesn't match the confirmed sale (wrong role/party)", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: buyerId,
        reviewee_id: sellerId,
        role: "seller",
        rating: 1,
      });
      expect(error).not.toBeNull();
    });

    it("blocks a user from submitting a review as someone else", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: sellerId,
        reviewee_id: buyerId,
        role: "seller",
        rating: 3,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: wtb_listings — owner sees own regardless of status, others see only active",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-wtb-owner-${suffix}@example.com`,
      other: `rls-wtb-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let otherId: string;
    let activeId: string;
    let notifiedActiveId: string;
    let fulfilledId: string;
    let draftId: string;
    let activatableDraftId: string;
    let deletableDraftId: string;
    let matchingListingId: string;

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
      ownerId = await mkUser(emails.owner);
      otherId = await mkUser(emails.other);

      const mkWtb = async (status: "draft" | "active" | "fulfilled", notifyMatches = false) => {
        const { data, error } = await admin
          .from("wtb_listings")
          .insert({
            user_id: ownerId,
            title: `RLS wtb ${status} listing`,
            status,
            notify_matches: notifyMatches,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      };
      activeId = await mkWtb("active");
      notifiedActiveId = await mkWtb("active", true);
      fulfilledId = await mkWtb("fulfilled");
      draftId = await mkWtb("draft");
      activatableDraftId = await mkWtb("draft");
      deletableDraftId = await mkWtb("draft");

      const { data: listing, error: listingError } = await admin
        .from("listings")
        .insert({
          seller_id: otherId,
          title: "Matching listing for WTB notification preference",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingError) throw listingError;
      matchingListingId = listing.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      const wtbIds = [
        activeId,
        notifiedActiveId,
        fulfilledId,
        draftId,
        activatableDraftId,
        deletableDraftId,
      ];
      await admin.from("wtb_match_notifications").delete().in("wtb_listing_id", wtbIds);
      await admin.from("listings").delete().eq("id", matchingListingId);
      await admin.from("wtb_listings").delete().in("id", wtbIds);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see their active, fulfilled, and draft wtb listings", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("wtb_listings")
        .select("id")
        .in("id", [activeId, fulfilledId, draftId]);
      expect(error).toBeNull();
      expect(new Set(data?.map((w) => w.id))).toEqual(new Set([activeId, fulfilledId, draftId]));
    });

    it("hides fulfilled and draft listings from other users but shows the active one", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("wtb_listings")
        .select("id")
        .in("id", [activeId, fulfilledId, draftId]);
      expect(error).toBeNull();
      expect(data?.map((w) => w.id)).toEqual([activeId]);
    });

    it("hides draft listings from anonymous visitors", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon.from("wtb_listings").select("id").eq("id", draftId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("lets the owner update and activate their own draft", async () => {
      const owner = await signIn(emails.owner);
      const { error, count } = await owner
        .from("wtb_listings")
        .update({ title: "Updated private draft", status: "active" }, { count: "exact" })
        .eq("id", activatableDraftId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });

    it("blocks a non-owner from activating someone else's draft", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("wtb_listings")
        .update({ status: "active" }, { count: "exact" })
        .eq("id", draftId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("lets the owner delete their own draft", async () => {
      const owner = await signIn(emails.owner);
      const { error, count } = await owner
        .from("wtb_listings")
        .delete({ count: "exact" })
        .eq("id", deletableDraftId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });

    it("creates WTB notifications only when the owner opted in", async () => {
      const { data, error } = await admin
        .from("wtb_match_notifications")
        .select("wtb_listing_id")
        .in("wtb_listing_id", [activeId, notifiedActiveId]);
      expect(error).toBeNull();
      expect(data?.map((row) => row.wtb_listing_id)).toEqual([notifiedActiveId]);
    });

    it("blocks a non-owner from updating someone else's wtb listing", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("wtb_listings")
        .update({ title: "Hijacked" }, { count: "exact" })
        .eq("id", activeId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("blocks a user from creating a wtb listing on someone else's behalf", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("wtb_listings")
        .insert({ user_id: ownerId, title: "Impersonated wtb listing" });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: vehicle_brands / vehicle_models — publicly readable, pending only insertable as pending by self",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-vehiclebrand-${suffix}@example.com`;
    const userIds: string[] = [];
    let userId: string;
    let pendingBrandId: string;

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
      userId = data.user!.id;
      userIds.push(userId);

      const { data: brand, error: brandErr } = await admin
        .from("vehicle_brands")
        .insert({
          name: `RLS Test Brand ${suffix}`,
          category_group: "bil",
          status: "pending",
          submitted_by: userId,
        })
        .select("id")
        .single();
      if (brandErr) throw brandErr;
      pendingBrandId = brand.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("vehicle_brands").delete().eq("id", pendingBrandId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read even a pending brand (SELECT policy has no status filter)", async () => {
      // Documents actual current behavior, not necessarily ideal: the
      // SELECT policy is USING (true) with no status check, so a
      // not-yet-approved, user-submitted brand name is technically
      // readable by anyone — the app is expected to filter pending values
      // out client-side (e.g. VehicleBrandField) rather than relying on RLS.
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("vehicle_brands")
        .select("id, status")
        .eq("id", pendingBrandId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].status).toBe("pending");
    });

    it("blocks a user from inserting a brand pre-approved as 'approved'", async () => {
      const client = await signIn();
      const { error } = await client.from("vehicle_brands").insert({
        name: `RLS Self-Approved Brand ${suffix}`,
        category_group: "bil",
        status: "approved",
        submitted_by: userId,
      });
      expect(error).not.toBeNull();
    });

    it("blocks a user from proposing a brand on someone else's behalf", async () => {
      const client = await signIn();
      const { error } = await client.from("vehicle_brands").insert({
        name: `RLS Impersonated Brand ${suffix}`,
        category_group: "bil",
        status: "pending",
        submitted_by: "00000000-0000-0000-0000-000000000000",
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("RLS: admin_moderation_log is readable only by admins/moderators", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    admin: `rls-modlog-admin-${suffix}@example.com`,
    other: `rls-modlog-other-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let logId: string;

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
    await mkUser(emails.other);
    await grantAdmin(admin, adminId);

    const { data, error } = await admin
      .from("admin_moderation_log")
      .insert({
        admin_id: adminId,
        action: "rls_test_action",
        target_type: "test",
        target_id: "rls-test",
        reason: "RLS test log entry",
      })
      .select("id")
      .single();
    if (error) throw error;
    logId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets an admin read the moderation log", async () => {
    const adminClient = await signIn(emails.admin);
    const { data, error } = await adminClient
      .from("admin_moderation_log")
      .select("id")
      .eq("id", logId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides the moderation log from a regular user", async () => {
    const other = await signIn(emails.other);
    const { data, error } = await other.from("admin_moderation_log").select("id").eq("id", logId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe.skipIf(!canRun)(
  "RLS: favorite_price_drops are visible only to their owner, never insertable by clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-pricedrop-owner-${suffix}@example.com`,
      seller: `rls-pricedrop-seller-${suffix}@example.com`,
      other: `rls-pricedrop-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let listingId: string;
    let dropId: string;

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
      ownerId = await mkUser(emails.owner);
      const sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS price drop test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: drop, error: dropErr } = await admin
        .from("favorite_price_drops")
        .insert({
          user_id: ownerId,
          listing_id: listingId,
          old_price_nok: 200,
          new_price_nok: 100,
          drop_pct: 50,
        })
        .select("id")
        .single();
      if (dropErr) throw dropErr;
      dropId = drop.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see and mark their own price-drop notification as read", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("favorite_price_drops")
        .select("id")
        .eq("id", dropId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { error: updateError, count } = await owner
        .from("favorite_price_drops")
        .update({ read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", dropId);
      expect(updateError).toBeNull();
      expect(count).toBe(1);
    });

    it("hides the notification from an unrelated user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("favorite_price_drops")
        .select("id")
        .eq("id", dropId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks clients from inserting price-drop rows directly (server-only via trigger)", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner.from("favorite_price_drops").insert({
        user_id: ownerId,
        listing_id: listingId,
        old_price_nok: 100,
        new_price_nok: 1,
        drop_pct: 99,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: favorite_sold_notifications are visible only to their owner, never insertable by clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-sold-owner-${suffix}@example.com`,
      seller: `rls-sold-seller-${suffix}@example.com`,
      other: `rls-sold-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let listingId: string;
    let notifId: string;

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
      ownerId = await mkUser(emails.owner);
      const sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS sold notif test listing",
          price_nok: 100,
          status: "sold",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: notif, error: notifErr } = await admin
        .from("favorite_sold_notifications")
        .insert({ user_id: ownerId, listing_id: listingId })
        .select("id")
        .single();
      if (notifErr) throw notifErr;
      notifId = notif.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see and mark their own sold notification as read", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("favorite_sold_notifications")
        .select("id")
        .eq("id", notifId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { error: updateError, count } = await owner
        .from("favorite_sold_notifications")
        .update({ read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", notifId);
      expect(updateError).toBeNull();
      expect(count).toBe(1);
    });

    it("hides the notification from an unrelated user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("favorite_sold_notifications")
        .select("id")
        .eq("id", notifId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks clients from inserting sold-notification rows directly (server-only via trigger)", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner
        .from("favorite_sold_notifications")
        .insert({ user_id: ownerId, listing_id: listingId });
      expect(error).not.toBeNull();
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
    let draftImageId: string;

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
          title: "RLS image test draft listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      draftListingId = listing.id;

      const { data: image, error: imageErr } = await admin
        .from("listing_images")
        .insert({ listing_id: draftListingId, storage_path: `rls-test/${suffix}.jpg` })
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
      const { error } = await other
        .from("listing_images")
        .insert({ listing_id: draftListingId, storage_path: `rls-hijack/${suffix}.jpg` });
      expect(error).not.toBeNull();
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

describe.skipIf(!canRun)(
  "RLS: listing_category_word_stats / listing_keyword_stats are publicly readable, not client-writable",
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

      const { error: keywordErr } = await admin
        .from("listing_keyword_stats")
        .insert({ word: lexeme, category_id: categoryId, listing_count: 1 });
      if (keywordErr) throw keywordErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin
        .from("listing_category_word_stats")
        .delete()
        .eq("lexeme", lexeme)
        .eq("category_id", categoryId);
      await admin
        .from("listing_keyword_stats")
        .delete()
        .eq("word", lexeme)
        .eq("category_id", categoryId);
      await admin.from("categories").delete().eq("id", categoryId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read both stats tables", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data: wordData, error: wordErr } = await anon
        .from("listing_category_word_stats")
        .select("lexeme")
        .eq("lexeme", lexeme);
      expect(wordErr).toBeNull();
      expect(wordData).toHaveLength(1);

      const { data: keywordData, error: keywordErr } = await anon
        .from("listing_keyword_stats")
        .select("word")
        .eq("word", lexeme);
      expect(keywordErr).toBeNull();
      expect(keywordData).toHaveLength(1);
    });

    it("blocks a regular authenticated client from writing to either stats table", async () => {
      const client = await signIn();
      const { error: wordErr } = await client
        .from("listing_category_word_stats")
        .insert({ lexeme: `${lexeme}-hijack`, category_id: categoryId, listing_count: 999 });
      expect(wordErr).not.toBeNull();

      const { error: keywordErr } = await client
        .from("listing_keyword_stats")
        .insert({ word: `${lexeme}-hijack`, category_id: categoryId, listing_count: 999 });
      expect(keywordErr).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: categories / category_filters / category_flows / filter_synonyms — public read, admin-only write",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-taxonomy-admin-${suffix}@example.com`,
      other: `rls-taxonomy-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let categoryId: string;

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
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      categoryId = await createTestCategory(admin, `taxonomy-${suffix}`);
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("categories").delete().eq("id", categoryId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read all four taxonomy tables", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      for (const table of [
        "categories",
        "category_filters",
        "category_flows",
        "filter_synonyms",
      ] as const) {
        const { error } = await anon.from(table).select("id").limit(1);
        expect(error, `${table} should be publicly readable`).toBeNull();
      }
    });

    it("blocks a non-admin authenticated user from renaming a category", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("categories")
        .update({ name_nb: "Hijacked category name" }, { count: "exact" })
        .eq("id", categoryId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("blocks a non-admin authenticated user from inserting a category filter", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("category_filters").insert({
        category_id: categoryId,
        key: `rls_hijack_${suffix}`,
        label_nb: "Hijacked filter",
        type: "text",
      });
      expect(error).not.toBeNull();
    });

    it("lets an admin insert and then delete a category filter", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("category_filters")
        .insert({
          category_id: categoryId,
          key: `rls_admin_test_${suffix}`,
          label_nb: "RLS admin test filter",
          type: "text",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).not.toBeNull();

      if (data) {
        const { error: deleteErr } = await adminClient
          .from("category_filters")
          .delete()
          .eq("id", data.id);
        expect(deleteErr).toBeNull();
      }
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: site_settings — public read, only admins can update the singleton row",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-sitesettings-admin-${suffix}@example.com`,
      other: `rls-sitesettings-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let originalDefaultSearchExamples: string[];
    let createdSiteSettings = false;

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
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      // This is a real singleton row used in production/staging (rotating
      // search-field examples on the landing page) — save its current
      // value so the admin-update test below can restore it afterwards
      // instead of leaving test data behind on a shared row.
      const { data: current, error: currentErr } = await admin
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .maybeSingle();
      if (currentErr) throw currentErr;
      if (current) {
        originalDefaultSearchExamples = current.default_search_examples;
      } else {
        originalDefaultSearchExamples = [];
        const { error: insertErr } = await admin
          .from("site_settings")
          .insert({ id: true, default_search_examples: [] });
        if (insertErr) throw insertErr;
        createdSiteSettings = true;
      }
    });

    afterAll(async () => {
      if (!canRun) return;
      if (createdSiteSettings) {
        await admin.from("site_settings").delete().eq("id", true);
      } else {
        await admin
          .from("site_settings")
          .update({ default_search_examples: originalDefaultSearchExamples })
          .eq("id", true);
      }
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets an anonymous visitor read site settings", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon.from("site_settings").select("id").eq("id", true);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("blocks a non-admin from updating site settings", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("site_settings")
        .update({ default_search_examples: ["hijacked"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("lets an admin update site settings", async () => {
      const adminClient = await signIn(emails.admin);
      const { error, count } = await adminClient
        .from("site_settings")
        .update({ default_search_examples: ["rls-test-example"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: app_settings has no client access at all, not even for admins",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = { admin: `rls-appsettings-admin-${suffix}@example.com` };
    const userIds: string[] = [];

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: emails.admin,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      const adminId = data.user!.id;
      userIds.push(adminId);
      await grantAdmin(admin, adminId);
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns app_settings rows to a client, even an admin (zero policies, service-role only — stores secrets like push_dispatch_secret)", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient.from("app_settings").select("key").limit(1);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
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
          price_nok: 50_000,
          status: "active",
          condition: "good",
          lat: 59.91,
          lng: 10.75,
          attributes: { horsepower: 90 },
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

describe.skipIf(!canRun)("RLS: error_log / push_dispatch_failures are fully server-only", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = { admin: `rls-serveronly-admin-${suffix}@example.com` };
  const userIds: string[] = [];
  let errorLogId: string;
  let pushFailureId: string;

  async function signIn(email: string) {
    return signInWithRetry(email);
  }

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: emails.admin,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const adminId = data.user!.id;
    userIds.push(adminId);
    await grantAdmin(admin, adminId);

    const { data: errLog, error: errLogErr } = await admin
      .from("error_log")
      .insert({ function_name: "rls_test_fn", error_message: "RLS test error" })
      .select("id")
      .single();
    if (errLogErr) throw errLogErr;
    errorLogId = errLog.id;

    const { data: pushFail, error: pushFailErr } = await admin
      .from("push_dispatch_failures")
      .insert({ kind: "rls_test", payload: {}, error: "RLS test failure" })
      .select("id")
      .single();
    if (pushFailErr) throw pushFailErr;
    pushFailureId = pushFail.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("error_log").delete().eq("id", errorLogId);
    await admin.from("push_dispatch_failures").delete().eq("id", pushFailureId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("never returns error_log rows to a client, even an admin (admin uses the admin_list_error_log RPC instead)", async () => {
    const adminClient = await signIn(emails.admin);
    const { data, error } = await adminClient.from("error_log").select("id").eq("id", errorLogId);
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it("never returns push_dispatch_failures rows to a client, even an admin", async () => {
    const adminClient = await signIn(emails.admin);
    const { data, error } = await adminClient
      .from("push_dispatch_failures")
      .select("id")
      .eq("id", pushFailureId);
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data).toHaveLength(0);
    }
  });
});

describe.skipIf(!canRun)(
  "RLS: system_messages are visible only to their recipient, only admins/moderators can send",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-sysmsg-admin-${suffix}@example.com`,
      recipient: `rls-sysmsg-recipient-${suffix}@example.com`,
      other: `rls-sysmsg-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let recipientId: string;
    let messageId: string;

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
      recipientId = await mkUser(emails.recipient);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { data: msg, error } = await admin
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "RLS test system message" })
        .select("id")
        .single();
      if (error) throw error;
      messageId = msg.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the recipient see and mark their own system message as read", async () => {
      const recipient = await signIn(emails.recipient);
      const { data, error } = await recipient
        .from("system_messages")
        .select("id")
        .eq("id", messageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { error: updateError, count } = await recipient
        .from("system_messages")
        .update({ read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", messageId);
      expect(updateError).toBeNull();
      expect(count).toBe(1);
    });

    it("hides the system message from an unrelated user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other.from("system_messages").select("id").eq("id", messageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks a regular user from sending a system message to someone else", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "Impersonated system message" });
      expect(error).not.toBeNull();
    });

    it("lets an admin send a system message", async () => {
      const adminClient = await signIn(emails.admin);
      const { error } = await adminClient
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "Admin-sent RLS test message" });
      expect(error).toBeNull();
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
describe.skipIf(!canRun)(
  "RLS: business organizations, listings, messages, storage and Proff entitlement",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-business-owner-${suffix}@example.com`,
      member: `rls-business-member-${suffix}@example.com`,
      buyer: `rls-business-buyer-${suffix}@example.com`,
      other: `rls-business-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const locationIds = new Map<string, string>();
    const objectPaths: string[] = [];
    let ownerId: string;
    let memberId: string;
    let buyerId: string;
    let otherId: string;
    let organizationId: string;
    let otherOrganizationId: string;
    let memberListingId: string;
    let ownerListingId: string;
    let otherOrganizationListingId: string;
    let insertedListingId: string;
    let conversationId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const createUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        const id = data.user!.id;
        userIds.push(id);
        return id;
      };

      ownerId = await createUser(emails.owner);
      memberId = await createUser(emails.member);
      buyerId = await createUser(emails.buyer);
      otherId = await createUser(emails.other);

      const createOrganization = async (number: string, name: string) => {
        const now = Date.now();
        const { data, error } = await admin
          .from("organizations")
          .insert({
            organization_number: number,
            legal_name: name,
            display_name: name,
            selected_plan: "proff",
            proff_trial_started_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            proff_trial_ends_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
            proff_access_until: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
            // This block tests membership/listing/storage RLS, not M-4's
            // registration-affiliation gate — grandfather these orgs in as
            // verified like a real approved business.
            verification_status: "verified",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (!data) throw new Error("Organization insert returned no row");
        organizationIds.push(data.id);
        const { data: location, error: locationError } = await admin
          .from("organization_locations")
          .insert({
            organization_id: data.id,
            name: "Hovedlokasjon",
            address_line: "Storgata 1",
            postal_code: "0001",
            city: "Oslo",
            is_default: true,
          })
          .select("id")
          .single();
        if (locationError) throw locationError;
        if (!location) throw new Error("Location insert returned no row");
        locationIds.set(data.id, location.id);
        return data.id;
      };
      const organizationNumber = 100_000_000 + (suffix % 800_000_000);
      organizationId = await createOrganization(
        String(organizationNumber),
        `RLS Bedrift ${suffix}`,
      );
      otherOrganizationId = await createOrganization(
        String(organizationNumber + 1),
        `RLS Annen bedrift ${suffix}`,
      );

      const { error: memberError } = await admin.from("organization_members").insert([
        { organization_id: organizationId, user_id: ownerId, role: "superuser", status: "active" },
        { organization_id: organizationId, user_id: memberId, role: "member", status: "active" },
        {
          organization_id: otherOrganizationId,
          user_id: otherId,
          role: "superuser",
          status: "active",
        },
      ]);
      if (memberError) throw memberError;
      const { error: locationMemberError } = await admin
        .from("organization_location_members")
        .insert([
          {
            organization_id: organizationId,
            location_id: locationIds.get(organizationId)!,
            user_id: ownerId,
            role: "manager",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
          {
            organization_id: organizationId,
            location_id: locationIds.get(organizationId)!,
            user_id: memberId,
            role: "member",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
          {
            organization_id: otherOrganizationId,
            location_id: locationIds.get(otherOrganizationId)!,
            user_id: otherId,
            role: "manager",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
        ]);
      if (locationMemberError) throw locationMemberError;

      const createListing = async (
        sellerId: string,
        listingOrganizationId: string,
        status: "draft" | "active",
        title: string,
      ) => {
        const { data, error } = await admin
          .from("listings")
          .insert({
            seller_id: sellerId,
            organization_id: listingOrganizationId,
            organization_location_id: locationIds.get(listingOrganizationId)!,
            title,
            price_nok: 100,
            status,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      };

      memberListingId = await createListing(
        memberId,
        organizationId,
        "draft",
        "RLS business member draft",
      );
      ownerListingId = await createListing(
        memberId,
        organizationId,
        "active",
        "RLS business owner active",
      );
      otherOrganizationListingId = await createListing(
        otherId,
        otherOrganizationId,
        "draft",
        "RLS other business draft",
      );

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({ listing_id: ownerListingId, buyer_id: buyerId, seller_id: memberId })
        .select("id")
        .single();
      if (conversationError) throw conversationError;
      conversationId = conversation.id;

      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: buyerId,
        body: "Er annonsen fortsatt tilgjengelig?",
      });
      if (messageError) throw messageError;
    });

    afterAll(async () => {
      if (!canRun) return;
      if (objectPaths.length > 0) {
        await admin.storage.from("organization-logos").remove(objectPaths);
      }
      await Promise.all(
        organizationIds.map((id) => admin.from("organizations").delete().eq("id", id)),
      );
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("isolates organization members while exposing public organization rows", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: ownerMembers, error: ownerError } = await owner
        .from("organization_members")
        .select("organization_id, user_id, role")
        .eq("organization_id", organizationId);
      expect(ownerError).toBeNull();
      expect(ownerMembers).toHaveLength(2);

      const { data: memberRows, error: memberError } = await member
        .from("organization_members")
        .select("organization_id, user_id")
        .in("organization_id", [organizationId, otherOrganizationId]);
      expect(memberError).toBeNull();
      expect(memberRows).toEqual([{ organization_id: organizationId, user_id: memberId }]);

      const { data: otherRows, error: otherError } = await other
        .from("organization_members")
        .select("organization_id, user_id")
        .in("organization_id", [organizationId, otherOrganizationId]);
      expect(otherError).toBeNull();
      expect(otherRows).toEqual([{ organization_id: otherOrganizationId, user_id: otherId }]);

      // M-5: the base table is member-only now — commercial state
      // (selected_plan, proff_access_until, ...) must not be readable by
      // anon or by a member of a different organization.
      const { data: anonBaseRow, error: anonBaseError } = await anon
        .from("organizations")
        .select("id")
        .eq("id", organizationId);
      expect(anonBaseError).toBeNull();
      expect(anonBaseRow).toHaveLength(0);

      const { data: otherBaseRow, error: otherBaseError } = await other
        .from("organizations")
        .select("id")
        .eq("id", organizationId);
      expect(otherBaseError).toBeNull();
      expect(otherBaseRow).toHaveLength(0);

      // The public view exposes only branding columns, for every org — it
      // never had a selected_plan column to select in the first place.
      const { error: publicError } = await anon
        .from("organizations_public")
        .select("id, selected_plan" as "id")
        .in("id", [organizationId, otherOrganizationId]);
      expect(publicError).not.toBeNull();

      const { data: publicSafeColumns, error: publicSafeError } = await anon
        .from("organizations_public")
        .select("id, listing_concept, listing_font, listing_overtitle")
        .in("id", [organizationId, otherOrganizationId]);
      expect(publicSafeError).toBeNull();
      expect(publicSafeColumns?.map((row) => row.id).sort()).toEqual(
        [organizationId, otherOrganizationId].sort(),
      );
      expect(
        publicSafeColumns?.every(
          (row) =>
            row.listing_concept === "redaksjonell" &&
            row.listing_font === "newsreader" &&
            row.listing_overtitle === "presentert_av",
        ),
      ).toBe(true);
      const { error: anonymousMembershipError } = await anon
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", organizationId);
      expect(anonymousMembershipError).not.toBeNull();

      const { error: directMembershipInsertError } = await member
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: buyerId,
          role: "member",
          status: "active",
        });
      expect(directMembershipInsertError).not.toBeNull();
      const { error: directOrganizationUpdateError } = await owner
        .from("organizations")
        .update({ display_name: "forged" })
        .eq("id", organizationId);
      expect(directOrganizationUpdateError).not.toBeNull();
    });

    it("allows business listing access only within the matching membership boundary", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: ownerListings, error: ownerError } = await owner
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(ownerError).toBeNull();
      expect(ownerListings?.map((row) => row.id).sort()).toEqual(
        [memberListingId, ownerListingId].sort(),
      );

      const { data: memberListings, error: memberError } = await member
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(memberError).toBeNull();
      expect(memberListings?.map((row) => row.id).sort()).toEqual(
        [memberListingId, ownerListingId].sort(),
      );

      const { data: otherListings, error: otherError } = await other
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(otherError).toBeNull();
      expect(otherListings?.map((row) => row.id).sort()).toEqual(
        [ownerListingId, otherOrganizationListingId].sort(),
      );

      const { data: anonymousListings, error: anonymousError } = await anon
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(anonymousError).toBeNull();
      expect(anonymousListings).toEqual([{ id: ownerListingId }]);

      const { error: anonymousInsertError } = await anon.from("listings").insert({
        seller_id: memberId,
        organization_id: organizationId,
        title: "RLS anonymous business listing",
        price_nok: 101,
        status: "draft",
      });
      expect(anonymousInsertError).not.toBeNull();

      const { data: insertedListing, error: insertError } = await member
        .from("listings")
        .insert({
          seller_id: memberId,
          organization_id: organizationId,
          organization_location_id: locationIds.get(organizationId)!,
          title: "RLS member-created business listing",
          price_nok: 101,
          status: "draft",
        })
        .select("id")
        .single();
      expect(insertError).toBeNull();
      expect(insertedListing?.id).toBeTruthy();
      insertedListingId = insertedListing!.id;

      const { error: forgedInsertError } = await member.from("listings").insert({
        seller_id: memberId,
        organization_id: otherOrganizationId,
        title: "RLS forged organization listing",
        price_nok: 101,
        status: "draft",
      });
      expect(forgedInsertError).not.toBeNull();

      const { error: memberUpdateError, count: memberUpdateCount } = await member
        .from("listings")
        .update({ title: "RLS member updated listing" }, { count: "exact" })
        .eq("id", memberListingId);
      expect(memberUpdateError).toBeNull();
      expect(memberUpdateCount).toBe(1);

      const { error: outsiderUpdateError, count: outsiderUpdateCount } = await other
        .from("listings")
        .update({ title: "RLS cross-business update" }, { count: "exact" })
        .eq("id", memberListingId);
      expect(outsiderUpdateError).toBeNull();
      expect(outsiderUpdateCount).toBe(0);

      const { count: ownerDeleteCount } = await owner
        .from("listings")
        .delete({ count: "exact" })
        .eq("id", insertedListingId);
      expect(ownerDeleteCount).toBe(1);
    });

    it("lets an organization superuser read and send messages, but not another business", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);

      const { data: ownerConversations, error: ownerConversationError } = await owner
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(ownerConversationError).toBeNull();
      expect(ownerConversations).toHaveLength(1);

      const { data: ownerMessages, error: ownerMessageError } = await owner
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId);
      expect(ownerMessageError).toBeNull();
      expect(ownerMessages).toHaveLength(1);

      const { data: memberConversations, error: memberConversationError } = await member
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(memberConversationError).toBeNull();
      expect(memberConversations).toHaveLength(1);

      const { data: memberMessages, error: memberMessageError } = await member
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId);
      expect(memberMessageError).toBeNull();
      expect(memberMessages).toHaveLength(1);

      const { data: otherConversations, error: otherConversationError } = await other
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(otherConversationError).toBeNull();
      expect(otherConversations).toHaveLength(0);

      const { error: sendError } = await owner.from("messages").insert({
        conversation_id: conversationId,
        sender_id: ownerId,
        body: "Jeg følger opp på vegne av bedriften.",
      });
      expect(sendError).toBeNull();

      const { error: readUpdateError, count: readUpdateCount } = await owner
        .from("conversations")
        .update({ seller_last_read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", conversationId);
      expect(readUpdateError).toBeNull();
      expect(readUpdateCount).toBe(1);

      const { error: outsiderSendError } = await other.from("messages").insert({
        conversation_id: conversationId,
        sender_id: otherId,
        body: "Cross-business message",
      });
      expect(outsiderSendError).not.toBeNull();
    });

    it("allows only an effective-Proff superuser to write organization logos", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);
      const path = `${organizationId}/rls-logo-${suffix}.png`;
      objectPaths.push(path);
      const content = new Blob(["rls-logo"], { type: "image/png" });

      const { error: ownerUploadError } = await owner.storage
        .from("organization-logos")
        .upload(path, content, { contentType: "image/png", upsert: true });
      expect(ownerUploadError).toBeNull();

      const { data: anonymousDownload, error: anonymousDownloadError } = await anon.storage
        .from("organization-logos")
        .download(path);
      expect(anonymousDownloadError).toBeNull();
      expect(anonymousDownload).toBeTruthy();

      const memberPath = `${organizationId}/member-${suffix}.png`;
      objectPaths.push(memberPath);
      const { error: memberUploadError } = await member.storage
        .from("organization-logos")
        .upload(memberPath, content, {
          contentType: "image/png",
          upsert: true,
        });
      expect(memberUploadError).not.toBeNull();

      const otherPath = `${organizationId}/other-${suffix}.png`;
      objectPaths.push(otherPath);
      const { error: otherUploadError } = await other.storage
        .from("organization-logos")
        .upload(otherPath, content, {
          contentType: "image/png",
          upsert: true,
        });
      expect(otherUploadError).not.toBeNull();
    });

    it("enforces the Proff entitlement boundary for owner, member, other user and anon", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const access = async (client: SupabaseClient) => {
        const { data, error } = await client.rpc("can_act_for_organization", {
          _organization_id: organizationId,
        });
        expect(error).toBeNull();
        return data;
      };

      expect(await access(owner)).toBe(true);
      expect(await access(member)).toBe(true);
      expect(await access(other)).toBe(false);
      expect(await access(anon)).toBe(false);

      const expiredAt = new Date(Date.now() - 1_000).toISOString();
      const { error: expirationError } = await admin
        .from("organizations")
        .update({ proff_access_until: expiredAt })
        .eq("id", organizationId);
      expect(expirationError).toBeNull();

      const { error: syncError } = await admin.rpc("sync_organization_entitlements", {
        _organization_id: organizationId,
      });
      expect(syncError).toBeNull();

      expect(await access(owner)).toBe(true);
      expect(await access(member)).toBe(false);
      expect(await access(other)).toBe(false);
      expect(await access(anon)).toBe(false);

      const { data: deactivatedMember, error: memberStatusError } = await owner
        .from("organization_members")
        .select("status")
        .eq("organization_id", organizationId)
        .eq("user_id", memberId)
        .single();
      expect(memberStatusError).toBeNull();
      expect(deactivatedMember?.status).toBe("deactivated");

      const { data: expiredMemberListing, error: expiredListingError } = await member
        .from("listings")
        .select("id")
        .eq("id", memberListingId);
      expect(expiredListingError).toBeNull();
      expect(expiredMemberListing).toHaveLength(0);
      const { data: ownerStillSeesListing, error: ownerListingError } = await owner
        .from("listings")
        .select("id")
        .eq("id", memberListingId);
      expect(ownerListingError).toBeNull();
      expect(ownerStillSeesListing).toHaveLength(1);

      const expiredLogoPath = `${organizationId}/expired-${suffix}.png`;
      objectPaths.push(expiredLogoPath);
      const { error: expiredOwnerUploadError } = await owner.storage
        .from("organization-logos")
        .upload(expiredLogoPath, new Blob(["expired"], { type: "image/png" }), {
          contentType: "image/png",
          upsert: true,
        });
      expect(expiredOwnerUploadError).not.toBeNull();
    });

    it("keeps proff_orders server-only and stacks paid terms on remaining access", async () => {
      const owner = await signIn(emails.owner);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: order, error: orderError } = await admin
        .from("proff_orders")
        .insert({
          organization_id: otherOrganizationId,
          term: "monthly",
          price_ex_vat_nok: 1490,
          billing_email: `faktura-${suffix}@example.com`,
        })
        .select("id")
        .single();
      expect(orderError).toBeNull();

      // Billing data must never leak to the client, not even to the superuser.
      for (const client of [owner, anon]) {
        const { data, error } = await client.from("proff_orders").select("id");
        expect(error !== null || (data ?? []).length === 0).toBe(true);
      }

      const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { error: expireError } = await admin
        .from("organizations")
        .update({ proff_access_until: expiredAt })
        .eq("id", otherOrganizationId);
      expect(expireError).toBeNull();

      const extend = async (months: number) => {
        const { data, error } = await admin
          .rpc("extend_proff_access", { _organization_id: otherOrganizationId, _months: months })
          .single();
        expect(error).toBeNull();
        return data as unknown as { period_start: string; period_end: string };
      };

      // Expired access starts a fresh period from now, not from the old date.
      const first = await extend(1);
      expect(Date.parse(first.period_start)).toBeGreaterThan(Date.parse(expiredAt));
      expect(Date.parse(first.period_end)).toBeGreaterThan(Date.now());

      // A renewal stacks on the remaining period instead of truncating it.
      const second = await extend(12);
      expect(Date.parse(second.period_start)).toBe(Date.parse(first.period_end));

      const { data: organization, error: readError } = await admin
        .from("organizations")
        .select("selected_plan, proff_access_until")
        .eq("id", otherOrganizationId)
        .single();
      expect(readError).toBeNull();
      expect(organization?.selected_plan).toBe("proff");
      expect(Date.parse(organization!.proff_access_until!)).toBe(Date.parse(second.period_end));

      await admin.from("proff_orders").delete().eq("id", order!.id);
    });
  },
);

describe.skipIf(!canRun)("RLS: storage buckets enforce owner/participant access (K-2)", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-storage-seller-${suffix}@example.com`,
    buyer: `rls-storage-buyer-${suffix}@example.com`,
    outsider: `rls-storage-outsider-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  const objectPaths: Record<string, string[]> = {
    "listing-images": [],
    "listing-360-frames": [],
    avatars: [],
    "message-attachments": [],
  };
  let sellerId: string;
  let buyerId: string;
  let activeListingId: string;
  let draftListingId: string;
  let conversationId: string;

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
    buyerId = await mkUser(emails.buyer);
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

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ listing_id: activeListingId, buyer_id: buyerId, seller_id: sellerId })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conversationId = conv.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    for (const [bucket, paths] of Object.entries(objectPaths)) {
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
    }
    await admin.from("listings").delete().in("id", [activeListingId, draftListingId]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets only the seller upload/delete listing images, but anyone read an active listing's", async () => {
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const anon = createClient(URL!, ANON_KEY!);
    const content = new Blob(["img"], { type: "image/png" });

    const path = `${sellerId}/${activeListingId}/rls-${suffix}.png`;
    objectPaths["listing-images"].push(path);

    const { error: outsiderUploadError } = await outsider.storage
      .from("listing-images")
      .upload(path, content, { contentType: "image/png" });
    expect(outsiderUploadError).not.toBeNull();

    const { error: sellerUploadError } = await seller.storage
      .from("listing-images")
      .upload(path, content, { contentType: "image/png" });
    expect(sellerUploadError).toBeNull();

    const { data: anonDownload, error: anonDownloadError } = await anon.storage
      .from("listing-images")
      .download(path);
    expect(anonDownloadError).toBeNull();
    expect(anonDownload).toBeTruthy();

    const { error: outsiderDeleteError } = await outsider.storage
      .from("listing-images")
      .remove([path]);
    // Supabase Storage returns ok even when RLS silently filters the row
    // out of the delete set, so assert the object is still there instead.
    expect(outsiderDeleteError).toBeNull();
    const { data: stillThere } = await seller.storage.from("listing-images").download(path);
    expect(stillThere).toBeTruthy();
  });

  it("hides a draft listing's images from everyone but the seller", async () => {
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const anon = createClient(URL!, ANON_KEY!);
    const content = new Blob(["img"], { type: "image/png" });

    const path = `${sellerId}/${draftListingId}/rls-${suffix}.png`;
    objectPaths["listing-images"].push(path);
    const { error: uploadError } = await seller.storage
      .from("listing-images")
      .upload(path, content, { contentType: "image/png" });
    expect(uploadError).toBeNull();

    const { error: anonError } = await anon.storage.from("listing-images").download(path);
    expect(anonError).not.toBeNull();

    const { error: outsiderError } = await outsider.storage.from("listing-images").download(path);
    expect(outsiderError).not.toBeNull();

    const { data: sellerDownload, error: sellerError } = await seller.storage
      .from("listing-images")
      .download(path);
    expect(sellerError).toBeNull();
    expect(sellerDownload).toBeTruthy();
  });

  it("exposes 360 frames of an active listing publicly but hides a draft's", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const content = new Blob(["frame"], { type: "image/webp" });

    const activePath = `${activeListingId}/0.webp`;
    objectPaths["listing-360-frames"].push(activePath);
    const { error: activeUploadError } = await admin.storage
      .from("listing-360-frames")
      .upload(activePath, content, { contentType: "image/webp" });
    expect(activeUploadError).toBeNull();

    const draftPath = `${draftListingId}/0.webp`;
    objectPaths["listing-360-frames"].push(draftPath);
    const { error: draftUploadError } = await admin.storage
      .from("listing-360-frames")
      .upload(draftPath, content, { contentType: "image/webp" });
    expect(draftUploadError).toBeNull();

    const { data: activeDownload, error: activeError } = await anon.storage
      .from("listing-360-frames")
      .download(activePath);
    expect(activeError).toBeNull();
    expect(activeDownload).toBeTruthy();

    const { error: draftError } = await anon.storage.from("listing-360-frames").download(draftPath);
    expect(draftError).not.toBeNull();
  });

  it("lets only conversation participants read/write message attachments", async () => {
    const seller = await signIn(emails.seller);
    const buyer = await signIn(emails.buyer);
    const outsider = await signIn(emails.outsider);
    const content = new Blob(["attachment"], { type: "image/png" });

    const path = `${conversationId}/rls-${suffix}.png`;
    objectPaths["message-attachments"].push(path);

    const { error: outsiderUploadError } = await outsider.storage
      .from("message-attachments")
      .upload(path, content, { contentType: "image/png" });
    expect(outsiderUploadError).not.toBeNull();

    const { error: buyerUploadError } = await buyer.storage
      .from("message-attachments")
      .upload(path, content, { contentType: "image/png" });
    expect(buyerUploadError).toBeNull();

    const { data: sellerDownload, error: sellerDownloadError } = await seller.storage
      .from("message-attachments")
      .download(path);
    expect(sellerDownloadError).toBeNull();
    expect(sellerDownload).toBeTruthy();

    const { error: outsiderDownloadError } = await outsider.storage
      .from("message-attachments")
      .download(path);
    expect(outsiderDownloadError).not.toBeNull();
  });

  it("lets anyone read avatars but only the owner write their own", async () => {
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const anon = createClient(URL!, ANON_KEY!);
    const content = new Blob(["avatar"], { type: "image/png" });

    const path = `${sellerId}/avatar-${suffix}.png`;
    objectPaths.avatars.push(path);

    const { error: outsiderUploadError } = await outsider.storage
      .from("avatars")
      .upload(path, content, { contentType: "image/png" });
    expect(outsiderUploadError).not.toBeNull();

    const { error: sellerUploadError } = await seller.storage
      .from("avatars")
      .upload(path, content, { contentType: "image/png" });
    expect(sellerUploadError).toBeNull();

    const { data: anonDownload, error: anonDownloadError } = await anon.storage
      .from("avatars")
      .download(path);
    expect(anonDownloadError).toBeNull();
    expect(anonDownload).toBeTruthy();
  });
});

describe.skipIf(!canRun)("RLS: feedback rate limiting is enforced in the database (M-8)", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();

  it("only service_role may call submit_feedback_rate_limited", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { error } = await anon.rpc("submit_feedback_rate_limited", {
      _key_hash: "a".repeat(64),
      _type: "ris",
      _message: "hei",
      _user_id: null,
    });
    expect(error).not.toBeNull();
  });

  it("allows 5 submissions per key per window and rejects the 6th", async () => {
    const keyHash = createHash("sha256").update(`m8-${suffix}`).digest("hex");

    for (let i = 0; i < 5; i++) {
      const { error } = await admin.rpc("submit_feedback_rate_limited", {
        _key_hash: keyHash,
        _type: "ris",
        _message: `attempt ${i}`,
        _user_id: null,
      });
      expect(error).toBeNull();
    }

    const { error: sixthError } = await admin.rpc("submit_feedback_rate_limited", {
      _key_hash: keyHash,
      _type: "ris",
      _message: "attempt 5",
      _user_id: null,
    });
    expect(sixthError?.message).toMatch(/rate_limited/);

    const { data: rows } = await admin.from("feedback").select("id").eq("message", `attempt 4`);
    expect(rows).toHaveLength(1);

    await admin.from("feedback").delete().like("message", "attempt %");
    await admin.from("feedback_rate_limits").delete().eq("key_hash", keyHash);
  });
});

describe.skipIf(!canRun)(
  "RLS: endpoint rate limiting for unauthenticated AI/heavy endpoints (M-9)",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();

    it("only service_role may call check_endpoint_rate_limit", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { error } = await anon.rpc("check_endpoint_rate_limit", {
        _bucket: "test",
        _key_hash: "a".repeat(64),
        _limit: 5,
        _window_seconds: 60,
      });
      expect(error).not.toBeNull();
    });

    it("allows up to the limit then rejects, per bucket+key independently", async () => {
      const keyHash = createHash("sha256").update(`m9-${suffix}`).digest("hex");
      const otherKeyHash = createHash("sha256").update(`m9-other-${suffix}`).digest("hex");
      const bucket = `m9-test-${suffix}`;

      for (let i = 0; i < 3; i++) {
        const { data: allowed, error } = await admin.rpc("check_endpoint_rate_limit", {
          _bucket: bucket,
          _key_hash: keyHash,
          _limit: 3,
          _window_seconds: 60,
        });
        expect(error).toBeNull();
        expect(allowed).toBe(true);
      }

      const { data: fourth, error: fourthError } = await admin.rpc("check_endpoint_rate_limit", {
        _bucket: bucket,
        _key_hash: keyHash,
        _limit: 3,
        _window_seconds: 60,
      });
      expect(fourthError).toBeNull();
      expect(fourth).toBe(false);

      // A different key in the same bucket has its own budget.
      const { data: otherAllowed, error: otherError } = await admin.rpc(
        "check_endpoint_rate_limit",
        { _bucket: bucket, _key_hash: otherKeyHash, _limit: 3, _window_seconds: 60 },
      );
      expect(otherError).toBeNull();
      expect(otherAllowed).toBe(true);

      await admin.from("endpoint_rate_limits").delete().eq("bucket", bucket);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: an unverified organization cannot create or publish listings (M-4)",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-m4-owner-${suffix}@example.com`,
      admin: `rls-m4-admin-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let ownerId: string;
    let organizationId: string;
    let locationId: string;

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
      ownerId = await mkUser(emails.owner);
      await mkUser(emails.admin);
      await admin.from("user_roles").insert({ user_id: userIds[1], role: "admin" });

      const organizationNumber = 200_000_000 + (suffix % 700_000_000);
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({
          organization_number: String(organizationNumber),
          legal_name: `RLS M-4 Bedrift ${suffix}`,
          display_name: `RLS M-4 Bedrift ${suffix}`,
          selected_plan: "proff",
          proff_access_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          // No verification_status given — must default to 'unverified'.
        })
        .select("id, verification_status")
        .single();
      if (orgError) throw orgError;
      organizationId = org.id;
      expect(org.verification_status).toBe("unverified");

      const { data: location, error: locationError } = await admin
        .from("organization_locations")
        .insert({
          organization_id: organizationId,
          name: "Hovedlokasjon",
          address_line: "Testgata 1",
          postal_code: "0001",
          city: "Oslo",
          is_default: true,
        })
        .select("id")
        .single();
      if (locationError) throw locationError;
      locationId = location.id;

      const { error: memberError } = await admin.from("organization_members").insert({
        organization_id: organizationId,
        user_id: ownerId,
        role: "superuser",
        status: "active",
      });
      if (memberError) throw memberError;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("organizations").delete().eq("id", organizationId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("blocks even the organization's own superuser from creating a listing", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner.from("listings").insert({
        seller_id: ownerId,
        organization_id: organizationId,
        organization_location_id: locationId,
        title: "M-4 unverified org listing",
        price_nok: 100,
        status: "draft",
      });
      expect(error).not.toBeNull();
    });

    it("rejects admin_verify_organization from a non-admin, then allows listing creation once an admin approves it", async () => {
      const owner = await signIn(emails.owner);
      const { error: selfVerifyError } = await owner.rpc("admin_verify_organization", {
        _organization_id: organizationId,
      });
      expect(selfVerifyError).not.toBeNull();

      const adminUser = await signIn(emails.admin);
      const { error: verifyError } = await adminUser.rpc("admin_verify_organization", {
        _organization_id: organizationId,
      });
      expect(verifyError).toBeNull();

      const { data: org } = await admin
        .from("organizations")
        .select("verification_status, verified_by")
        .eq("id", organizationId)
        .single();
      expect(org?.verification_status).toBe("verified");
      expect(org?.verified_by).toBe(userIds[1]);

      const { error: insertError } = await owner.from("listings").insert({
        seller_id: ownerId,
        organization_id: organizationId,
        organization_location_id: locationId,
        title: "M-4 now-verified org listing",
        price_nok: 100,
        status: "draft",
      });
      expect(insertError).toBeNull();
    });
  },
);
