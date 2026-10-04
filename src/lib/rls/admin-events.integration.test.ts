/** RLS integration tests for the shared admin inbox; run via `bun run test:rls`. */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  grantAdmin,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("RLS: admin_events — role × operation decision table", () => {
  const service = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const userIds: string[] = [];
  const eventId = randomUUID();
  const event = {
    id: eventId,
    kind: "category_suggestion",
    target_id: randomUUID(),
    title: "RLS test event",
  };
  let adminId: string;
  let clients: Record<"admin" | "user" | "anonymous", SupabaseClient>;

  beforeAll(async () => {
    const suffix = randomUUID();
    const adminEmail = `rls-events-admin-${suffix}@example.com`;
    const userEmail = `rls-events-user-${suffix}@example.com`;
    adminId = await createRlsUser(service, adminEmail, userIds);
    await createRlsUser(service, userEmail, userIds);
    await grantAdmin(service, adminId);
    clients = {
      admin: await signInWithRetry(adminEmail),
      user: await signInWithRetry(userEmail),
      anonymous: createClient(URL!, ANON_KEY!),
    };
    const { error } = await service.from("admin_events").insert(event);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!canRun) return;
    await service.from("admin_events").delete().eq("id", eventId);
    await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id)));
  });

  it.each(["admin", "user", "anonymous"] as const)(
    "%s can read and handle events only with the admin role",
    async (role) => {
      const client = clients[role];
      const read = await client.from("admin_events").select("id").eq("id", eventId);
      if (role === "anonymous") expect(read.error?.code).toBe("42501");
      else {
        expect(read.error).toBeNull();
        expect(read.data).toEqual(role === "admin" ? [{ id: eventId }] : []);
      }

      const before = await service
        .from("admin_events")
        .select("handled_at, handled_by")
        .eq("id", eventId)
        .single();
      expect(before.error).toBeNull();
      const handledAt = new Date().toISOString();
      const update = await client
        .from("admin_events")
        .update({ handled_at: handledAt, handled_by: adminId })
        .eq("id", eventId)
        .select("id");
      if (role === "anonymous") expect(update.error?.code).toBe("42501");
      else {
        expect(update.error).toBeNull();
        expect(update.data).toEqual(role === "admin" ? [{ id: eventId }] : []);
      }
      const stored = await service
        .from("admin_events")
        .select("handled_at, handled_by")
        .eq("id", eventId)
        .single();
      expect(stored.error).toBeNull();
      expect(stored.data?.handled_by).toBe(adminId);
      if (role === "admin") {
        expect(new Date(stored.data!.handled_at).toISOString()).toBe(handledAt);
      } else {
        expect(stored.data).toEqual(before.data);
      }
    },
  );

  it.each(["admin", "user", "anonymous"] as const)(
    "%s cannot create, delete or rewrite event content",
    async (role) => {
      const client = clients[role];
      const insert = await client.from("admin_events").insert({ ...event, id: randomUUID() });
      expect(insert.error?.code).toBe("42501");
      const update = await client
        .from("admin_events")
        .update({ title: "Tampered event" })
        .eq("id", eventId);
      expect(update.error?.code).toBe("42501");
      const deletion = await client.from("admin_events").delete().eq("id", eventId);
      expect(deletion.error?.code).toBe("42501");
      const stored = await service.from("admin_events").select("title").eq("id", eventId).single();
      expect(stored.error).toBeNull();
      expect(stored.data?.title).toBe(event.title);
    },
  );
});
