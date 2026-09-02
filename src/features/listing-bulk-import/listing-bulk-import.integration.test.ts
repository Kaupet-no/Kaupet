import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

describe.skipIf(!canRun)("RLS: bulk import status", () => {
  const admin = createClient<Database>(URL!, SERVICE_ROLE_KEY!);
  const suffix = Date.now();
  const userIds: string[] = [];
  let organizationId = "";
  let importId = "";
  let owner: SupabaseClient<Database>;
  let outsider: SupabaseClient<Database>;

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
    const ownerId = await createUser(`bulk-owner-${suffix}@example.com`);
    const outsiderId = await createUser(`bulk-outsider-${suffix}@example.com`);
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({
        organization_number: `9${String(suffix).slice(-8)}`,
        legal_name: "Bulk Import Test AS",
        display_name: "Bulk Import Test",
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (organizationError) throw organizationError;
    organizationId = organization.id;
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: ownerId,
      role: "superuser",
      status: "active",
    });
    if (memberError) throw memberError;
    importId = crypto.randomUUID();
    const { error: importError } = await admin.from("organization_listing_imports").insert({
      organization_id: organizationId,
      user_id: ownerId,
      import_id: importId,
      external_id: "external-1",
      status: "created",
    });
    if (importError) throw importError;
    const signIn = async (email: string) => {
      const client = createClient<Database>(URL!, ANON_KEY!);
      const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw error;
      return client;
    };
    owner = await signIn(`bulk-owner-${suffix}@example.com`);
    outsider = await signIn(`bulk-outsider-${suffix}@example.com`);
    void outsiderId;
  });

  afterAll(async () => {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lar et aktivt medlem lese egen import, men avviser krysskonto og direkte skriving", async () => {
    const { data, error } = await owner
      .from("organization_listing_imports")
      .select("external_id, status")
      .eq("organization_id", organizationId);
    expect(error).toBeNull();
    expect(data).toEqual([{ external_id: "external-1", status: "created" }]);
    const { data: outsiderRows, error: outsiderError } = await outsider
      .from("organization_listing_imports")
      .select("id")
      .eq("organization_id", organizationId);
    expect(outsiderError).toBeNull();
    expect(outsiderRows).toEqual([]);
    const { error: directWriteError } = await owner.from("organization_listing_imports").insert({
      organization_id: organizationId,
      user_id: userIds[0],
      import_id: crypto.randomUUID(),
      external_id: "external-2",
      status: "processing",
    });
    expect(directWriteError).not.toBeNull();
  });
});
