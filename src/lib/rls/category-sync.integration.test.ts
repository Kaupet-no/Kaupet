import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

// KG-06-F02 / PB-4: bruk samme anon-rolle som produksjonens staging-leseklient.
describe.skipIf(!canRun)("kategorisnapshot med offentlige leserettigheter", () => {
  const admin = canRun ? createClient<Database>(URL!, SERVICE_ROLE_KEY!) : null!;
  const userIds: string[] = [];
  const email = `snapshot-${Date.now()}@example.com`;
  let categoryId: string;
  beforeAll(async () => {
    await createRlsUser(admin, email, userIds);
    const { data, error } = await admin
      .from("categories")
      .insert({
        slug: `snapshot-${Date.now()}`,
        name_nb: "Snapshot æøå 👋",
      })
      .select("id")
      .single();
    if (error) throw error;
    categoryId = data.id;
    const filters = await admin.from("category_filters").insert(
      Array.from({ length: 1001 }, (_, i) => ({
        category_id: categoryId,
        key: `snapshot_${i}`,
        label_nb: `Felt ${i}`,
        type: "text" as const,
      })),
    );
    if (filters.error) throw filters.error;
  });
  afterAll(async () => {
    if (categoryId) {
      await admin.from("category_filters").delete().eq("category_id", categoryId);
      await admin.from("categories").delete().eq("id", categoryId);
    }
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it.each(["anon", "authenticated", "service_role"])(
    "%s leser hele offentlige grunnlaget over radgrensen",
    async (role) => {
      const client =
        role === "anon"
          ? createClient<Database>(URL!, ANON_KEY!)
          : role === "authenticated"
            ? await signInWithRetry(email)
            : admin;
      const { data, error } = await client.rpc("category_sync_snapshot");
      expect(error).toBeNull();
      const snapshot = data as {
        categories: { id: string }[];
        category_filters: { category_id: string }[];
      };
      expect(snapshot.categories.some((row) => row.id === categoryId)).toBe(true);
      expect(
        snapshot.category_filters.filter((row) => row.category_id === categoryId),
      ).toHaveLength(1001);
    },
  );
});
