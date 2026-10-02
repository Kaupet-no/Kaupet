/** RLS integration tests: moderation. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  signInWithRetry,
  grantAdmin,
} from "../rls-test-helpers";

describe.skipIf(!canRun)(
  "RLS: moderation blocks publication for banned and suspended owners",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-publish-admin-${suffix}@example.com`,
      banned: `rls-publish-banned-${suffix}@example.com`,
      suspended: `rls-publish-suspended-${suffix}@example.com`,
      normal: `rls-publish-normal-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    const listingIds: string[] = [];
    const wtbIds: string[] = [];
    let adminId: string;
    let bannedId: string;
    let suspendedId: string;
    let normalId: string;
    let bannedWtbId: string;
    let suspendedWtbId: string;
    let expiredSuspensionWtbId: string;

    async function createListing(sellerId: string, status: "active" | "draft") {
      const { data, error } = await admin
        .from("listings")
        .insert({ seller_id: sellerId, title: "Moderation test listing", price_nok: 100, status })
        .select("id")
        .single();
      if (error) throw error;
      listingIds.push(data.id);
      return data.id;
    }

    async function createWtb(userId: string, status: "active" | "archived") {
      const { data, error } = await admin
        .from("wtb_listings")
        .insert({ user_id: userId, title: "Moderation test purchase", status })
        .select("id")
        .single();
      if (error) throw error;
      wtbIds.push(data.id);
      return data.id;
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
      suspendedId = await mkUser(emails.suspended);
      normalId = await mkUser(emails.normal);
      await grantAdmin(admin, adminId);

      for (const userId of [bannedId, suspendedId]) await createListing(userId, "draft");
      const activeToDisable = await createListing(bannedId, "active");
      await createListing(normalId, "active");
      bannedWtbId = await createWtb(bannedId, "active");
      suspendedWtbId = await createWtb(suspendedId, "active");
      expiredSuspensionWtbId = await createWtb(normalId, "active");
      const { error: expiredSuspensionError } = await admin.from("user_suspensions").insert({
        user_id: normalId,
        reason: "Expired publication test",
        suspended_by: adminId,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });
      if (expiredSuspensionError) throw expiredSuspensionError;

      const adminClient = await signInWithRetry(emails.admin);
      const { error: disableError } = await adminClient.rpc("admin_ban_user", {
        _user_id: bannedId,
        _reason: "Publication test",
      });
      if (disableError) throw disableError;
      const { error: suspendError } = await adminClient.rpc("admin_suspend_user", {
        _user_id: suspendedId,
        _reason: "Publication test",
        _days: 30,
      });
      if (suspendError) throw suspendError;
      const { data: disabled, error: readError } = await admin
        .from("listings")
        .select("id")
        .eq("id", activeToDisable)
        .eq("status", "disabled")
        .single();
      if (readError) throw readError;
      expect(disabled.id).toBe(activeToDisable);
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("wtb_listings").delete().in("id", wtbIds);
      await admin.from("listings").delete().in("id", listingIds);
      await admin.from("user_bans").delete().in("user_id", userIds);
      await admin.from("user_suspensions").delete().in("user_id", userIds);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("allows normal active listing and WTB publication through service-role", async () => {
      await expect(createListing(normalId, "active")).resolves.toEqual(expect.any(String));
      await expect(createWtb(normalId, "active")).resolves.toEqual(expect.any(String));
    });

    it("archives active WTB listings when ban or active suspension is applied", async () => {
      const { data, error } = await admin
        .from("wtb_listings")
        .select("id, status")
        .in("id", [bannedWtbId, suspendedWtbId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.every(({ status }) => status === "archived")).toBe(true);
    });

    it("does not archive WTB listings for expired suspensions", async () => {
      const { data, error } = await admin
        .from("wtb_listings")
        .select("status")
        .eq("id", expiredSuspensionWtbId)
        .single();
      expect(error).toBeNull();
      expect(data?.status).toBe("active");
    });

    it.each(["banned", "suspended"] as const)(
      "blocks %s listing publication through service-role",
      async (label) => {
        const userId = label === "banned" ? bannedId : suspendedId;
        const { data: drafts, error: readError } = await admin
          .from("listings")
          .select("id")
          .eq("seller_id", userId)
          .eq("status", "draft");
        expect(readError).toBeNull();
        expect(drafts).toHaveLength(1);

        const { error: titleError } = await admin
          .from("listings")
          .update({ title: "Draft remains editable" })
          .eq("id", drafts![0].id);
        expect(titleError).toBeNull();
        const { error: activateError } = await admin
          .from("listings")
          .update({ status: "active" })
          .eq("id", drafts![0].id);
        expect(activateError).not.toBeNull();
        const { error: insertError } = await admin.from("listings").insert({
          seller_id: userId,
          title: "Blocked new publication",
          price_nok: 100,
          status: "active",
        });
        expect(insertError).not.toBeNull();
        const { error: draftInsertError } = await admin.from("listings").insert({
          seller_id: userId,
          title: "Blocked draft creation",
          price_nok: 100,
          status: "draft",
        });
        expect(draftInsertError).not.toBeNull();
        const { error: unpublishError } = await admin
          .from("listings")
          .update({ status: "archived" })
          .eq("id", drafts![0].id);
        expect(unpublishError).toBeNull();
      },
    );

    it.each(["banned", "suspended"] as const)(
      "blocks WTB publication by moderated user %s",
      async (label) => {
        const userId = label === "banned" ? bannedId : suspendedId;
        const { error: insertError } = await admin
          .from("wtb_listings")
          .insert({ user_id: userId, title: "Blocked purchase publication", status: "active" });
        expect(insertError).not.toBeNull();
        const archivedId = await createWtb(userId, "archived");
        const { error: activateError } = await admin
          .from("wtb_listings")
          .update({ status: "active" })
          .eq("id", archivedId);
        expect(activateError).not.toBeNull();
      },
    );

    it("allows non-publication WTB status changes and keeps admin_enable_listing explicit", async () => {
      const archivedId = await createWtb(normalId, "active");
      const { error: archiveError } = await admin
        .from("wtb_listings")
        .update({ status: "archived" })
        .eq("id", archivedId);
      expect(archiveError).toBeNull();

      const adminClient = await signInWithRetry(emails.admin);
      const { data: disabled } = await admin
        .from("listings")
        .select("id")
        .eq("seller_id", bannedId)
        .eq("status", "disabled")
        .limit(1)
        .single();
      expect(disabled).not.toBeNull();
      const { error: enableError } = await adminClient.rpc("admin_enable_listing", {
        _id: disabled!.id,
      });
      expect(enableError).toBeNull();
      const { data: enabled, error: enabledReadError } = await admin
        .from("listings")
        .select("status")
        .eq("id", disabled!.id)
        .single();
      expect(enabledReadError).toBeNull();
      expect(enabled?.status).toBe("active");
    });
  },
);

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

      const ipAddress = `203.0.113.${suffix % 255}`;
      // ip_bans.banned_by has no FK, so a row from an interrupted prior run
      // can still be sitting on this ip_address and collide with the insert
      // below (ip_address is unique).
      await admin.from("ip_bans").delete().eq("ip_address", ipAddress);

      const { data, error } = await admin
        .from("ip_bans")
        .insert({
          ip_address: ipAddress,
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
      await admin.from("ip_bans").delete().eq("id", ipBanId);
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

    it("rejects direct report writes; the server function owns submission", async () => {
      const reporter = await signIn(emails.reporter);
      const { error } = await reporter
        .from("reports")
        .insert({ listing_id: listingId, reporter_id: reporterId, reason: "Second report" });
      expect(error).not.toBeNull();
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
