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
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    let notificationId: string;

    async function signIn(email: string) {
      const client = createClient(URL!, ANON_KEY!);
      const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw error;
      return client;
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

      const { data: search, error: searchErr } = await admin
        .from("saved_searches")
        .insert({ user_id: ownerId, name: "RLS ssn test search", criteria: {} })
        .select("id")
        .single();
      if (searchErr) throw searchErr;

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

      const { data: notif, error: notifErr } = await admin
        .from("saved_search_notifications")
        .insert({ saved_search_id: search.id, user_id: ownerId, listing_id: listing.id })
        .select("id")
        .single();
      if (notifErr) throw notifErr;
      notificationId = notif.id;
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
        saved_search_id: notificationId,
        user_id: ownerId,
        listing_id: notificationId,
      });
      expect(error).not.toBeNull();
    });
  },
);

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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
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
      const client = createClient(URL!, ANON_KEY!);
      const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw error;
      return client;
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
