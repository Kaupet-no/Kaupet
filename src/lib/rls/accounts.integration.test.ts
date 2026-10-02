/** RLS integration tests: accounts. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
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

describe.skipIf(!canRun)("RLS: account deletion requests are private to their owner", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-deletion-owner-${suffix}@example.com`,
    other: `rls-deletion-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let ownerId: string;

  beforeAll(async () => {
    ownerId = await createRlsUser(admin, emails.owner, userIds);
    await createRlsUser(admin, emails.other, userIds);
    const { error } = await admin.from("account_deletions").insert({
      user_id: ownerId,
      confirmation_email: emails.owner,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("account_deletions").delete().eq("user_id", ownerId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("viser bare eierens rad og skjuler den for annen bruker og anonym", async () => {
    const owner = await signInWithRetry(emails.owner);
    const other = await signInWithRetry(emails.other);
    const anon = createClient(URL!, ANON_KEY!);
    const ownerRead = await owner
      .from("account_deletions")
      .select("user_id")
      .eq("user_id", ownerId);
    const otherRead = await other
      .from("account_deletions")
      .select("user_id")
      .eq("user_id", ownerId);
    const anonRead = await anon.from("account_deletions").select("user_id").eq("user_id", ownerId);
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toHaveLength(1);
    expect(otherRead.data).toHaveLength(0);
    expect(anonRead.data).toHaveLength(0);
  });

  it("stenger direkte oppretting/oppdatering, men lar eieren slette egen forespørsel", async () => {
    const owner = await signInWithRetry(emails.owner);
    const { error: insertError } = await owner.from("account_deletions").insert({
      user_id: ownerId,
      confirmation_email: emails.owner,
    });
    expect(insertError).not.toBeNull();
    const { error: updateError, count: updateCount } = await owner
      .from("account_deletions")
      .update({ confirmation_email: "endret@example.com" }, { count: "exact" })
      .eq("user_id", ownerId);
    expect(updateError).toBeNull();
    expect(updateCount).toBe(0);
    const { error: deleteError, count } = await owner
      .from("account_deletions")
      .delete({ count: "exact" })
      .eq("user_id", ownerId);
    expect(deleteError).toBeNull();
    expect(count).toBe(1);
    const { error: restoreError } = await admin.from("account_deletions").insert({
      user_id: ownerId,
      confirmation_email: emails.owner,
    });
    expect(restoreError).toBeNull();
  });
});
