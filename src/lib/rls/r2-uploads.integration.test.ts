/** RLS integration tests: r2-uploads. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("RLS: standard R2 upload quotas are atomic and service-only", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const email = `rls-upload-quota-${suffix}@example.com`;
  const userIds: string[] = [];

  beforeAll(async () => {
    await createRlsUser(admin, email, userIds);
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  async function seedQuota(objectCount: number, totalBytes: number, windowStartedAt = new Date()) {
    const { error } = await admin.from("standard_upload_quotas").upsert({
      user_id: userIds[0]!,
      window_started_at: windowStartedAt.toISOString(),
      object_count: objectCount,
      total_bytes: totalBytes,
    });
    expect(error).toBeNull();
  }

  it("denies anon/authenticated quota reads, writes, and RPC execution", async () => {
    const client = await signInWithRetry(email);
    const anon = createClient(URL!, ANON_KEY!);

    for (const candidate of [anon, client]) {
      const { data, error } = await candidate.from("standard_upload_quotas").select("user_id");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
      const insert = await candidate.from("standard_upload_quotas").insert({
        user_id: userIds[0]!,
        object_count: 0,
        total_bytes: 0,
      });
      expect(insert.error).not.toBeNull();
      const update = await candidate
        .from("standard_upload_quotas")
        .update({ object_count: 0 })
        .eq("user_id", userIds[0]!);
      expect(update.error !== null || update.count === 0).toBe(true);
      const rpc = await candidate.rpc("reserve_standard_upload_quota", {
        _user_id: userIds[0]!,
        _bytes: 1,
      });
      expect(rpc.error).not.toBeNull();
    }
  });

  it("enforces the object ceiling under concurrent reservations", async () => {
    const userId = userIds[0]!;
    await seedQuota(499, 1);

    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        admin.rpc("reserve_standard_upload_quota", { _user_id: userId, _bytes: 1 }),
      ),
    );
    expect(reservations.filter((result) => result.data === true)).toHaveLength(1);
    expect(reservations.every((result) => result.error === null)).toBe(true);

    const { data: quota, error: quotaError } = await admin
      .from("standard_upload_quotas")
      .select("object_count, total_bytes")
      .eq("user_id", userId)
      .single();
    expect(quotaError).toBeNull();
    expect(quota).toMatchObject({ object_count: 500, total_bytes: 2 });
    const overLimit = await admin.rpc("reserve_standard_upload_quota", {
      _user_id: userId,
      _bytes: 1,
    });
    expect(overLimit.error).toBeNull();
    expect(overLimit.data).toBe(false);
  });

  it("enforces the byte ceiling under concurrent reservations", async () => {
    const userId = userIds[0]!;
    await seedQuota(1, 536870911);
    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        admin.rpc("reserve_standard_upload_quota", { _user_id: userId, _bytes: 1 }),
      ),
    );
    expect(reservations.filter((result) => result.data === true)).toHaveLength(1);
    expect(reservations.every((result) => result.error === null)).toBe(true);
    const { data: quota, error } = await admin
      .from("standard_upload_quotas")
      .select("object_count, total_bytes")
      .eq("user_id", userId)
      .single();
    expect(error).toBeNull();
    expect(quota).toMatchObject({ object_count: 2, total_bytes: 536870912 });
  });

  it("resets an expired 24-hour window atomically", async () => {
    const userId = userIds[0]!;
    await seedQuota(500, 536870912, new Date(Date.now() - 25 * 60 * 60 * 1000));
    const result = await admin.rpc("reserve_standard_upload_quota", {
      _user_id: userId,
      _bytes: 7,
    });
    expect(result).toMatchObject({ data: true, error: null });
    const { data: quota, error } = await admin
      .from("standard_upload_quotas")
      .select("object_count, total_bytes")
      .eq("user_id", userId)
      .single();
    expect(error).toBeNull();
    expect(quota).toMatchObject({ object_count: 1, total_bytes: 7 });
  });

  it("rejects zero and over-5-MiB reservations without changing quota totals", async () => {
    const userId = userIds[0]!;
    await seedQuota(3, 17);
    const zeroBytes = await admin.rpc("reserve_standard_upload_quota", {
      _user_id: userId,
      _bytes: 0,
    });
    const tooManyBytes = await admin.rpc("reserve_standard_upload_quota", {
      _user_id: userId,
      _bytes: 5242881,
    });
    expect(zeroBytes).toMatchObject({ data: false, error: null });
    expect(tooManyBytes).toMatchObject({ data: false, error: null });
    const { data, error } = await admin
      .from("standard_upload_quotas")
      .select("object_count, total_bytes")
      .eq("user_id", userId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ object_count: 3, total_bytes: 17 });
  });
});

describe.skipIf(!canRun)("RLS: registered R2 orphan cleanup", () => {
  const admin = createClient(URL!, SERVICE_ROLE_KEY!);
  const userEmail = `rls-r2-cleanup-${Date.now()}@example.com`;
  const partnerEmail = `rls-r2-cleanup-partner-${Date.now()}@example.com`;
  let userId = "";
  let partnerId = "";
  let listingId = "";
  let conversationId = "";
  let organizationId = "";
  let locationId = "";
  let anon: SupabaseClient;
  const keys: string[] = [];

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: userEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
    const partner = await admin.auth.admin.createUser({
      email: partnerEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (partner.error) throw partner.error;
    partnerId = partner.data.user!.id;
    anon = createClient(URL!, ANON_KEY!);

    const listing = await admin
      .from("listings")
      .insert({ seller_id: userId, title: "R2 orphan fixture", price_nok: 100, status: "draft" })
      .select("id")
      .single();
    if (listing.error) throw listing.error;
    listingId = listing.data.id;
    const conversation = await admin
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: partnerId, seller_id: userId })
      .select("id")
      .single();
    if (conversation.error) throw conversation.error;
    conversationId = conversation.data.id;

    const organization = await admin
      .from("organizations")
      .insert({
        organization_number: String(400_000_000 + (Date.now() % 500_000_000)),
        legal_name: "R2 orphan fixture",
        display_name: "R2 orphan fixture",
      })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    organizationId = organization.data.id;
    const location = await admin
      .from("organization_locations")
      .insert({ organization_id: organizationId, name: "R2 orphan fixture", is_default: true })
      .select("id")
      .single();
    if (location.error) throw location.error;
    locationId = location.data.id;
  });

  afterAll(async () => {
    if (keys.length) await admin.from("standard_upload_objects").delete().in("object_key", keys);
    if (conversationId) {
      await admin.from("messages").delete().eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }
    if (listingId) {
      await admin.from("listing_images").delete().eq("listing_id", listingId);
      await admin.from("listings").delete().eq("id", listingId);
    }
    if (locationId) {
      await admin.from("organization_location_contacts").delete().eq("location_id", locationId);
      await admin.from("organization_locations").delete().eq("id", locationId);
    }
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (partnerId) await admin.auth.admin.deleteUser(partnerId);
  });

  it("claims old orphans, retains references, rejects late references, and retries failures", async () => {
    const orphanKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    const referencedKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    const recentKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    keys.push(orphanKey, referencedKey, recentKey);
    expect(
      await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: orphanKey }),
    ).toMatchObject({ error: null });
    expect(
      await admin.rpc("register_standard_upload_object", {
        _bucket: "BILDER",
        _key: referencedKey,
      }),
    ).toMatchObject({ error: null });
    expect(
      await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: recentKey }),
    ).toMatchObject({ error: null });
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .in("object_key", [orphanKey, referencedKey]);
    const { error: referenceError } = await admin
      .from("profiles")
      .update({ avatar_url: `https://bilder.kaupet.no/${referencedKey}` })
      .eq("id", userId);
    expect(referenceError).toBeNull();

    const { data: firstClaim, error: claimError } = await admin.rpc(
      "claim_orphan_standard_uploads",
      { _limit: 100 },
    );
    expect(claimError).toBeNull();
    const firstRows = firstClaim as
      { id: number; bucket: string; object_key: string; attempts: number }[] | null;
    const orphan = firstRows!.find((row) => row.object_key === orphanKey);
    expect(orphan).toMatchObject({ bucket: "BILDER", object_key: orphanKey, attempts: 0 });
    expect(firstRows!.some((row) => row.object_key === referencedKey)).toBe(false);
    expect(firstRows!.some((row) => row.object_key === recentKey)).toBe(false);

    const { error: lateReferenceError } = await admin
      .from("profiles")
      .update({ avatar_url: `https://bilder.kaupet.no/${orphanKey}` })
      .eq("id", userId);
    expect(lateReferenceError).not.toBeNull();
    expect(lateReferenceError!.message).toMatch(/under opprydding/);

    expect(
      (
        await admin.rpc("finish_orphan_standard_upload", {
          _id: orphan!.id,
          _deleted: false,
          _error: "R2 nede",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.rpc("register_standard_upload_object", {
          _bucket: "BILDER",
          _key: orphanKey,
        })
      ).error,
    ).not.toBeNull();
    await admin
      .from("standard_upload_objects")
      .update({ claimed_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() })
      .eq("id", orphan!.id);
    const { data: retryClaim, error: retryError } = await admin.rpc(
      "claim_orphan_standard_uploads",
      { _limit: 100 },
    );
    expect(retryError).toBeNull();
    const retryRows = retryClaim as
      { id: number; bucket: string; object_key: string; attempts: number }[] | null;
    const retry = retryRows!.find((row) => row.object_key === orphanKey);
    expect(retry).toMatchObject({ attempts: 1 });
    expect(
      (await admin.rpc("finish_orphan_standard_upload", { _id: retry!.id, _deleted: true })).error,
    ).toBeNull();
    const { error: deletedReferenceError } = await admin
      .from("profiles")
      .update({ avatar_url: `https://bilder.kaupet.no/${orphanKey}` })
      .eq("id", userId);
    expect(deletedReferenceError).not.toBeNull();
    expect(
      (
        await admin.rpc("register_standard_upload_object", {
          _bucket: "BILDER",
          _key: orphanKey,
        })
      ).error,
    ).not.toBeNull();
  });

  it("retains each supported metadata reference until it is cleared", async () => {
    const listingKey = `${listingId}/${crypto.randomUUID()}.jpg`;
    const thumbKey = listingKey.replace(/\.jpg$/, "-thumb.jpg");
    const logoKey = `${organizationId}/logo-${crypto.randomUUID()}.jpg`;
    const contactKey = `${organizationId}/contact-${crypto.randomUUID()}.jpg`;
    const attachmentKey = `${conversationId}/${crypto.randomUUID()}.jpg`;
    const mediaKeys = [listingKey, thumbKey, logoKey, contactKey, attachmentKey];
    keys.push(...mediaKeys);

    for (const [index, key] of mediaKeys.entries()) {
      const bucket = index === mediaKeys.length - 1 ? "VEDLEGG" : "BILDER";
      expect(
        await admin.rpc("register_standard_upload_object", { _bucket: bucket, _key: key }),
      ).toMatchObject({ error: null });
    }
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .eq("object_key", thumbKey);
    const thumbBefore = await admin
      .from("standard_upload_objects")
      .select("created_at")
      .eq("object_key", thumbKey)
      .single();
    expect(
      (await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: thumbKey }))
        .error,
    ).toBeNull();
    const thumbAfter = await admin
      .from("standard_upload_objects")
      .select("created_at")
      .eq("object_key", thumbKey)
      .single();
    expect(new Date(thumbAfter.data!.created_at).getTime()).toBeGreaterThan(
      new Date(thumbBefore.data!.created_at).getTime(),
    );
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .in("object_key", mediaKeys);

    const listingImage = await admin
      .from("listing_images")
      .insert({ listing_id: listingId, storage_path: listingKey })
      .select("id")
      .single();
    expect(listingImage.error).toBeNull();
    expect(
      (await admin.from("organizations").update({ logo_path: logoKey }).eq("id", organizationId))
        .error,
    ).toBeNull();
    const contact = await admin
      .from("organization_location_contacts")
      .insert({
        location_id: locationId,
        organization_id: organizationId,
        name: "R2 testkontakt",
        phone: "12345678",
        avatar_path: contactKey,
      })
      .select("id")
      .single();
    expect(contact.error).toBeNull();
    const message = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: "Vedleggstest",
        attachment_path: attachmentKey,
      })
      .select("id")
      .single();
    expect(message.error).toBeNull();

    const { data: firstClaim, error: firstError } = await admin.rpc(
      "claim_orphan_standard_uploads",
      { _limit: 100 },
    );
    expect(firstError).toBeNull();
    const firstRows = firstClaim as { id: number; bucket: string; object_key: string }[] | null;
    expect(mediaKeys.every((key) => !firstRows!.some((row) => row.object_key === key))).toBe(true);

    expect(
      (await admin.from("listing_images").delete().eq("id", listingImage.data!.id)).error,
    ).toBeNull();
    expect(
      (await admin.from("organizations").update({ logo_path: null }).eq("id", organizationId))
        .error,
    ).toBeNull();
    expect(
      (await admin.from("organization_location_contacts").delete().eq("id", contact.data!.id))
        .error,
    ).toBeNull();
    expect((await admin.from("messages").delete().eq("id", message.data!.id)).error).toBeNull();

    const { data: clearedClaim, error: clearedError } = await admin.rpc(
      "claim_orphan_standard_uploads",
      { _limit: 100 },
    );
    expect(clearedError).toBeNull();
    const clearedRows = clearedClaim as { id: number; bucket: string; object_key: string }[] | null;
    const nowClaimed = clearedRows!.filter((row) => mediaKeys.includes(row.object_key));
    expect(nowClaimed.map((row) => row.object_key).sort()).toEqual([...mediaKeys].sort());
    for (const row of nowClaimed) {
      expect(
        (await admin.rpc("finish_orphan_standard_upload", { _id: row.id, _deleted: true })).error,
      ).toBeNull();
    }
  });

  it("renews cleanup grace when an old thumbnail is registered again", async () => {
    const thumbKey = `${listingId}/${crypto.randomUUID()}-thumb.jpg`;
    const orphanKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    keys.push(thumbKey, orphanKey);
    for (const key of [thumbKey, orphanKey]) {
      expect(
        (await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: key }))
          .error,
      ).toBeNull();
    }
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .in("object_key", [thumbKey, orphanKey]);

    expect(
      (await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: thumbKey }))
        .error,
    ).toBeNull();
    const { data, error } = await admin.rpc("claim_orphan_standard_uploads", { _limit: 100 });
    expect(error).toBeNull();
    const rows = data as { object_key: string }[] | null;
    expect(rows!.some((row) => row.object_key === thumbKey)).toBe(false);
    expect(rows!.some((row) => row.object_key === orphanKey)).toBe(true);
  });

  it("rejects listing and message references after claim and after deletion", async () => {
    const listingKey = `${listingId}/${crypto.randomUUID()}.jpg`;
    const attachmentKey = `${conversationId}/${crypto.randomUUID()}.jpg`;
    keys.push(listingKey, attachmentKey);
    for (const [bucket, key] of [
      ["BILDER", listingKey],
      ["VEDLEGG", attachmentKey],
    ] as const) {
      expect(
        (await admin.rpc("register_standard_upload_object", { _bucket: bucket, _key: key })).error,
      ).toBeNull();
    }
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .in("object_key", [listingKey, attachmentKey]);
    const { data, error } = await admin.rpc("claim_orphan_standard_uploads", { _limit: 100 });
    expect(error).toBeNull();
    const claimedRows = data as { id: number; object_key: string }[] | null;
    const claimedIds = new Map(claimedRows!.map((row) => [row.object_key, row.id]));
    expect(claimedIds.has(listingKey)).toBe(true);
    expect(claimedIds.has(attachmentKey)).toBe(true);

    const rejectReferences = async () => {
      const listingInsert = await admin
        .from("listing_images")
        .insert({ listing_id: listingId, storage_path: listingKey });
      const messageInsert = await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: "Vedlegg etter sletting",
        attachment_path: attachmentKey,
      });
      expect(listingInsert.error?.message).toMatch(/under opprydding/);
      expect(messageInsert.error?.message).toMatch(/under opprydding/);
    };
    await rejectReferences();
    for (const id of claimedIds.values()) {
      expect(
        (await admin.rpc("finish_orphan_standard_upload", { _id: id, _deleted: true })).error,
      ).toBeNull();
    }
    await rejectReferences();
    expect(
      (await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: listingKey }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await admin.rpc("register_standard_upload_object", {
          _bucket: "VEDLEGG",
          _key: attachmentKey,
        })
      ).error,
    ).not.toBeNull();
  });

  it("excludes max-retry rows and prunes deleted tombstones older than seven days", async () => {
    const exhaustedKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    const pruneKey = `${userId}/avatar-${crypto.randomUUID()}.jpg`;
    keys.push(exhaustedKey, pruneKey);
    for (const key of [exhaustedKey, pruneKey]) {
      expect(
        (await admin.rpc("register_standard_upload_object", { _bucket: "BILDER", _key: key }))
          .error,
      ).toBeNull();
    }
    await admin
      .from("standard_upload_objects")
      .update({
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        attempts: 10,
      })
      .eq("object_key", exhaustedKey);
    await admin
      .from("standard_upload_objects")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .eq("object_key", pruneKey);

    const { data: claim, error } = await admin.rpc("claim_orphan_standard_uploads", {
      _limit: 100,
    });
    expect(error).toBeNull();
    const claimRows = claim as { id: number; object_key: string }[] | null;
    expect(claimRows!.some((row) => row.object_key === exhaustedKey)).toBe(false);
    const pruned = claimRows!.find((row) => row.object_key === pruneKey);
    expect(pruned).toBeDefined();
    expect(
      (await admin.rpc("finish_orphan_standard_upload", { _id: pruned!.id, _deleted: true })).error,
    ).toBeNull();
    await admin
      .from("standard_upload_objects")
      .update({ claimed_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("object_key", pruneKey);
    expect((await admin.rpc("claim_orphan_standard_uploads", { _limit: 100 })).error).toBeNull();
    const tombstone = await admin
      .from("standard_upload_objects")
      .select("id")
      .eq("object_key", pruneKey)
      .maybeSingle();
    expect(tombstone.error).toBeNull();
    expect(tombstone.data).toBeNull();
    expect(
      (
        await admin
          .from("standard_upload_objects")
          .select("state, attempts")
          .eq("object_key", exhaustedKey)
          .single()
      ).data,
    ).toMatchObject({ state: "ready", attempts: 10 });
  });

  it("keeps the registry and claim RPC private to service role", async () => {
    const { error: tableError } = await anon.from("standard_upload_objects").select("id").limit(1);
    expect(tableError).not.toBeNull();
    const signedIn = await signInWithRetry(userEmail);
    const { error: rpcError } = await signedIn.rpc("claim_orphan_standard_uploads", { _limit: 1 });
    expect(rpcError).not.toBeNull();
  });
});
