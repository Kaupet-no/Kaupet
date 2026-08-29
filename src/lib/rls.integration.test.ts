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
  "RLS: listing_views — anyone can log a view, nobody (not even the owner) can read raw rows",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-views-owner-${suffix}@example.com`;
    const userIds: string[] = [];
    let listingId: string;
    let viewId: string;

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
      const ownerId = data.user!.id;
      userIds.push(ownerId);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: ownerId,
          title: "RLS listing_views test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: view, error: viewErr } = await admin
        .from("listing_views")
        .insert({ listing_id: listingId, visitor_key: `rls-visitor-${suffix}` })
        .select("id")
        .single();
      if (viewErr) throw viewErr;
      viewId = view.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("blocks direct table INSERT — logging a view only works via the log_listing_view RPC", async () => {
      // 20260617123639_*.sql and 20260617142736_fix-listing-view-logging.sql
      // both REVOKE INSERT (and SELECT) on listing_views from anon/
      // authenticated entirely — PostgREST upserts need SELECT to check
      // ON CONFLICT, which anon must never have (visitor_key shouldn't be
      // publicly readable), so logging moved to a SECURITY DEFINER RPC
      // that only needs EXECUTE. A raw client insert is expected to fail
      // with a grant-level permission error now, not just an RLS filter.
      const anon = createClient(URL!, ANON_KEY!);
      const { error } = await anon
        .from("listing_views")
        .insert({ listing_id: listingId, visitor_key: `rls-anon-visitor-${suffix}` });
      expect(error).not.toBeNull();
    });

    it("lets an anonymous visitor log a view via the log_listing_view RPC", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { error } = await anon.rpc("log_listing_view", {
        _listing_id: listingId,
        _visitor_key: `rls-anon-rpc-visitor-${suffix}`,
      });
      expect(error).toBeNull();
    });

    it("blocks even the listing owner from reading raw view rows directly (no GRANT at all — use the listing_stats RPC instead)", async () => {
      // No SELECT grant remains for authenticated either (revoked in the
      // same two migrations) — owners get view counts via listing_stats(),
      // never a raw table read.
      const owner = await signIn();
      const { error } = await owner.from("listing_views").select("id").eq("id", viewId);
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: listing_view_events are readable only by admins, insertable only via the log_listing_view RPC",
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
        .insert({ listing_id: listingId, visitor_key: `rls-event-visitor-${suffix}` })
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

    it("blocks a client from inserting a view event directly (no client GRANT — log_listing_view RPC only)", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("listing_view_events")
        .insert({ listing_id: listingId, visitor_key: `rls-hijack-visitor-${suffix}` });
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
  "RLS: search_query_stats has no client access at all, not even for admins",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-searchstats-admin-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    const query = `rls test query ${suffix}`;

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

      const { error: insertErr } = await admin
        .from("search_query_stats")
        .insert({ query, search_count: 1 });
      if (insertErr) throw insertErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("search_query_stats").delete().eq("query", query);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns search_query_stats rows to a client, even an admin (zero policies on this table)", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("search_query_stats")
        .select("query")
        .eq("query", query);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
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
