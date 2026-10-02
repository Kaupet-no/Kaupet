/** RLS integration tests: rate-limits-server-only. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createRlsUser,
  signInWithRetry,
  grantAdmin,
} from "../rls-test-helpers";

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

describe.skipIf(!canRun)("RLS: authenticated write limits are isolated per user", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userA = `11111111-1111-4111-8111-${String(suffix).slice(-12).padStart(12, "0")}`;
  const userB = `22222222-2222-4222-8222-${String(suffix + 1)
    .slice(-12)
    .padStart(12, "0")}`;
  const bucket = `user-write-test-${suffix}`;

  it("allows the limit for user A without consuming user B's quota", async () => {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await admin.rpc("check_user_rate_limit", {
        _bucket: bucket,
        _user_id: userA,
        _limit: 3,
        _window_seconds: 60,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    }

    const { data: exhausted, error: exhaustedError } = await admin.rpc("check_user_rate_limit", {
      _bucket: bucket,
      _user_id: userA,
      _limit: 3,
      _window_seconds: 60,
    });
    expect(exhaustedError).toBeNull();
    expect(exhausted).toBe(false);

    const { data: otherAllowed, error: otherError } = await admin.rpc("check_user_rate_limit", {
      _bucket: bucket,
      _user_id: userB,
      _limit: 3,
      _window_seconds: 60,
    });
    expect(otherError).toBeNull();
    expect(otherAllowed).toBe(true);

    const { error: cleanupError } = await admin
      .from("endpoint_rate_limits")
      .delete()
      .eq("bucket", bucket);
    expect(cleanupError).toBeNull();
  });

  it("serializes concurrent reservations so calls cannot race past the limit", async () => {
    const concurrentBucket = `${bucket}-concurrent`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.rpc("check_user_rate_limit", {
          _bucket: concurrentBucket,
          _user_id: userA,
          _limit: 3,
          _window_seconds: 60,
        }),
      ),
    );

    expect(results.every(({ error }) => error === null)).toBe(true);
    expect(results.filter(({ data }) => data === true)).toHaveLength(3);
    expect(results.filter(({ data }) => data === false)).toHaveLength(5);

    const { error } = await admin
      .from("endpoint_rate_limits")
      .delete()
      .eq("bucket", concurrentBucket);
    expect(error).toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: user creation quotas and limiter state are protected", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const email = `rls-user-creation-limit-${suffix}@example.com`;
  const userIds: string[] = [];
  let userId: string;
  let client: SupabaseClient;
  const listingBucket = "listing_creation";
  const wtbBucket = "wtb_creation";
  let keyHash: string;

  beforeAll(async () => {
    userId = await createRlsUser(admin, email, userIds);
    client = await signInWithRetry(email);
    keyHash = createHash("sha256").update(userId).digest("hex");
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("endpoint_rate_limits").delete().eq("key_hash", keyHash);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("keeps direct Data API inserts disabled and denies client access to limiter state", async () => {
    const { error: listingError } = await client
      .from("listings")
      .insert({ seller_id: userId, title: "Forsøk på direkte annonse", price_nok: 100 });
    expect(listingError?.code).toBe("42501");
    const { error: wtbError } = await client
      .from("wtb_listings")
      .insert({ user_id: userId, title: "Forsøk på direkte kjøpsønske" });
    expect(wtbError?.code).toBe("42501");

    const { error: stateError } = await client.from("endpoint_rate_limits").select("attempts");
    expect(stateError?.code).toBe("42501");
    const { error: updateStateError } = await client
      .from("endpoint_rate_limits")
      .update({ attempts: 0 })
      .eq("bucket", listingBucket);
    expect(updateStateError?.code).toBe("42501");
    const { error: deleteStateError } = await client
      .from("endpoint_rate_limits")
      .delete()
      .eq("bucket", listingBucket);
    expect(deleteStateError?.code).toBe("42501");
    const { error: rpcError } = await client.rpc("check_user_rate_limit", {
      _bucket: listingBucket,
      _user_id: userId,
      _limit: 5,
      _window_seconds: 3600,
    });
    expect(rpcError?.code).toBe("42501");

    const { data: state, error } = await admin
      .from("endpoint_rate_limits")
      .select("bucket")
      .in("bucket", [listingBucket, wtbBucket])
      .eq("key_hash", keyHash);
    expect(error).toBeNull();
    expect(state).toEqual([]);
  });

  it("keeps the hourly counter after a listing row is deleted and recreated", async () => {
    for (let i = 0; i < 4; i++) {
      const { data, error } = await admin.rpc("check_user_rate_limit", {
        _bucket: listingBucket,
        _user_id: userId,
        _limit: 5,
        _window_seconds: 3600,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    }

    const insertListing = (title: string) =>
      admin.from("listings").insert({ seller_id: userId, title }).select("id").single();
    const { data: first, error: firstError } = await insertListing("Kvotetest først");
    expect(firstError).toBeNull();
    expect((await admin.from("listings").delete().eq("id", first!.id)).error).toBeNull();
    const { data: replacement, error: replacementError } =
      await insertListing("Kvotetest erstattet");
    expect(replacementError).toBeNull();
    expect((await admin.from("listings").delete().eq("id", replacement!.id)).error).toBeNull();

    const { data: fifth, error: fifthError } = await admin.rpc("check_user_rate_limit", {
      _bucket: listingBucket,
      _user_id: userId,
      _limit: 5,
      _window_seconds: 3600,
    });
    expect(fifthError).toBeNull();
    expect(fifth).toBe(true);
    const { data: sixth, error: sixthError } = await admin.rpc("check_user_rate_limit", {
      _bucket: listingBucket,
      _user_id: userId,
      _limit: 5,
      _window_seconds: 3600,
    });
    expect(sixthError).toBeNull();
    expect(sixth).toBe(false);
  });
});

describe.skipIf(!canRun)("RLS: report submission enforces the per-user limit", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    first: `rls-report-limit-first-${suffix}@example.com`,
    second: `rls-report-limit-second-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let listingId: string;

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

    const ownerId = await createUser(emails.first);
    await createUser(emails.second);
    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: ownerId,
        title: `RLS report limit ${suffix}`,
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("reports").delete().in("reporter_id", userIds);
    await admin
      .from("endpoint_rate_limits")
      .delete()
      .eq("bucket", "report_submission")
      .in(
        "key_hash",
        userIds.map((id) => createHash("sha256").update(id).digest("hex")),
      );
    await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("rejects the 11th report from A while B can still submit", async () => {
    const first = await signInWithRetry(emails.first);
    const second = await signInWithRetry(emails.second);
    const args = {
      _listing_id: listingId,
      _reason: "RLS test reason",
      _comment: null,
    };

    for (let i = 0; i < 10; i++) {
      const { error } = await first.rpc("submit_listing_report", args);
      expect(error).toBeNull();
    }

    const { error: exhaustedError } = await first.rpc("submit_listing_report", args);
    expect(exhaustedError?.message).toMatch(/rate_limited/);

    const { error: secondError } = await second.rpc("submit_listing_report", args);
    expect(secondError).toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: interne logger, køer og rate-limit-tabeller er service-only", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const email = `rls-internal-${suffix}@example.com`;
  const userIds: string[] = [];
  let listingId: string;
  let historyListingId: string;
  let queueId: number;
  let productEventId: number;
  let vehicleLogId: string;

  beforeAll(async () => {
    const userId = await createRlsUser(admin, email, userIds);
    const createListing = async (title: string) => {
      const { data, error } = await admin
        .from("listings")
        .insert({ seller_id: userId, title, price_nok: 100, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    };
    historyListingId = await createListing(`RLS history ${suffix}`);
    listingId = await createListing(`RLS queue ${suffix}`);
    const { error: signupError } = await admin.from("business_signup_intents").insert({
      organization_number: String(300_000_000 + (suffix % 600_000_000)),
      legal_name: "RLS intern test",
      email: `intern-${suffix}@example.com`,
    });
    if (signupError) throw signupError;
    const { error: limitError } = await admin.from("listing_360_upload_rate_limits").insert({
      scope: "ip",
      key_hash: createHash("sha256").update(`360-${suffix}`).digest("hex"),
    });
    if (limitError) throw limitError;
    const { error: eventLimitError } = await admin.from("product_event_rate_limits").insert({
      key_hash: createHash("sha256").update(`event-${suffix}`).digest("hex"),
    });
    if (eventLimitError) throw eventLimitError;
    const { data: event, error: eventError } = await admin
      .from("product_events")
      .insert({
        event_name: "listing_publish_failed",
        platform: "web",
        path: "/rls-test",
        properties: {},
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    productEventId = event.id;
    const { data: vehicleLog, error: vehicleLogError } = await admin
      .from("vehicle_lookup_log")
      .insert({ user_id: userId, registration_number: `RL${suffix}` })
      .select("id")
      .single();
    if (vehicleLogError) throw vehicleLogError;
    vehicleLogId = vehicleLog.id;
    const { error: deleteError } = await admin.from("listings").delete().eq("id", listingId);
    if (deleteError) throw deleteError;
    const { data: queue, error: queueError } = await admin
      .from("r2_delete_queue")
      .select("id")
      .eq("prefix", `${listingId}/`)
      .single();
    if (queueError) throw queueError;
    queueId = queue.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("business_signup_intents").delete().like("email", `intern-${suffix}%`);
    await admin
      .from("listing_360_upload_rate_limits")
      .delete()
      .eq("key_hash", createHash("sha256").update(`360-${suffix}`).digest("hex"));
    await admin.from("product_events").delete().eq("id", productEventId);
    await admin
      .from("product_event_rate_limits")
      .delete()
      .eq("key_hash", createHash("sha256").update(`event-${suffix}`).digest("hex"));
    await admin.from("vehicle_lookup_log").delete().eq("id", vehicleLogId);
    await admin.from("listings").delete().eq("id", historyListingId);
    await admin
      .from("r2_delete_queue")
      .delete()
      .in("prefix", [`${listingId}/`, `${historyListingId}/`]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("skjuler alle service-only-tabeller for anonym og autentisert klient", async () => {
    const client = await signInWithRetry(email);
    const anon = createClient(URL!, ANON_KEY!);
    for (const table of [
      "business_signup_intents",
      "listing_360_upload_rate_limits",
      "listing_status_history",
      "product_event_rate_limits",
      "product_events",
      "r2_delete_queue",
      "vehicle_lookup_log",
    ] as const) {
      for (const candidate of [anon, client]) {
        const { data, error } = await candidate.from(table).select("*").limit(1);
        expect(error !== null || (data ?? []).length === 0, `${table} leaked a row`).toBe(true);
      }
    }
  });

  it("avviser klient-skriving mens service_role kan administrere kontrakten", async () => {
    const client = await signInWithRetry(email);
    const attempts = [
      client
        .from("business_signup_intents")
        .insert({ organization_number: "301000000", legal_name: "client" }),
      client
        .from("listing_360_upload_rate_limits")
        .insert({ scope: "ip", key_hash: "a".repeat(64) }),
      client.from("product_event_rate_limits").insert({ key_hash: "b".repeat(64) }),
      client.from("listing_status_history").insert({
        listing_id: historyListingId,
        status: "draft",
        changed_at: new Date().toISOString(),
      }),
      client.from("product_events").insert({
        event_name: "listing_publish_failed",
        platform: "web",
        path: "/client",
        properties: {},
      }),
      client.from("r2_delete_queue").insert({ bucket: "BILDER", prefix: "client/" }),
      client
        .from("vehicle_lookup_log")
        .insert({ user_id: userIds[0], registration_number: "CLIENT" }),
    ];
    for (const attempt of attempts) expect((await attempt).error).not.toBeNull();

    const { data: history, error: historyError } = await admin
      .from("listing_status_history")
      .select("listing_id")
      .eq("listing_id", historyListingId);
    expect(historyError).toBeNull();
    expect(history).toHaveLength(1);
    const { error: queueUpdateError } = await admin
      .from("r2_delete_queue")
      .update({ attempts: 1 })
      .eq("id", queueId);
    expect(queueUpdateError).toBeNull();
  });
});
