/** RLS integration tests: notifications-favorites. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { URL, SERVICE_ROLE_KEY, canRun, PASSWORD, signInWithRetry } from "../rls-test-helpers";

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

  it("blocks the seller from favoriting their own listing", async () => {
    const seller = await signIn(emails.seller);
    const {
      data: { user },
    } = await seller.auth.getUser();
    const { error } = await seller
      .from("favorites")
      .insert({ user_id: user!.id, listing_id: listingId });
    expect(error?.code).toBe("42501");
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
  const p256dh = Buffer.from(
    "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
    "hex",
  ).toString("base64url");
  const auth = Buffer.alloc(16, 1).toString("base64url");

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
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
        p256dh,
        auth,
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

  it("rejects direct writes to untrusted endpoints and atomically caps devices at 20", async () => {
    const owner = await signIn(emails.owner);
    const { error: invalidError } = await owner.from("push_subscriptions").insert({
      user_id: ownerId,
      endpoint: "https://127.0.0.1/latest",
      p256dh,
      auth,
    });
    expect(invalidError).not.toBeNull();
    const { error: invalidKeysError } = await owner.from("push_subscriptions").insert({
      user_id: ownerId,
      endpoint: `https://fcm.googleapis.com/fcm/send/invalid-keys-${suffix}`,
      p256dh: "bad",
      auth: "bad",
    });
    expect(invalidKeysError).not.toBeNull();

    const additions = Array.from({ length: 18 }, (_, i) => ({
      user_id: ownerId,
      endpoint: `https://updates.push.services.mozilla.com/wpush/v1/${suffix}-${i}`,
      p256dh,
      auth,
    }));
    const { error: seedError } = await owner.from("push_subscriptions").insert(additions);
    expect(seedError).toBeNull();

    const competingAdds = [18, 19].map((i) =>
      owner.from("push_subscriptions").insert({
        user_id: ownerId,
        endpoint: `https://updates.push.services.mozilla.com/wpush/v1/${suffix}-${i}`,
        p256dh,
        auth,
      }),
    );
    const results = await Promise.all(competingAdds);
    expect(results.filter(({ error }) => !error)).toHaveLength(1);
    expect(results.filter(({ error }) => error)).toHaveLength(1);

    const { error: mixedPlatformError } = await owner.from("push_subscriptions").insert({
      user_id: ownerId,
      platform: "android",
      fcm_token: `native-${suffix}`,
    });
    expect(mixedPlatformError).not.toBeNull();

    const { error: existingDeviceError } = await owner.from("push_subscriptions").upsert(
      {
        user_id: ownerId,
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
        p256dh,
        auth,
      },
      { onConflict: "endpoint" },
    );
    expect(existingDeviceError).toBeNull();

    const { error: updateError } = await owner
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", subscriptionId);
    expect(updateError).toBeNull();
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
