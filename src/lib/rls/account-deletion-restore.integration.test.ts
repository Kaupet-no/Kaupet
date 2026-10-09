/** PB-4: run only against the local Supabase stack. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { URL, SERVICE_ROLE_KEY, canRun, createRlsUser, signInWithRetry } from "../rls-test-helpers";

describe.skipIf(!canRun)("cancel_account_deletion restores original states", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const email = `rls-restore-${Date.now()}@example.com`;
  const users: string[] = [];
  let userId: string;
  beforeAll(async () => {
    userId = await createRlsUser(admin, email, users);
  });
  afterAll(async () => {
    await admin.from("account_deletions").delete().eq("user_id", userId);
    await admin.from("listings").delete().eq("seller_id", userId);
    await admin.from("wtb_listings").delete().eq("user_id", userId);
    await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("preserves draft, active, archived, sold time and fulfilled wishes across repeated requests", async () => {
    const soldAt = new Date(Date.now() - 5 * 864e5).toISOString();
    const states = ["draft", "active", "sold", "archived"];
    const { data: listings, error } = await admin
      .from("listings")
      .insert(
        states.map((status) => ({
          seller_id: userId,
          title: `Restore ${status}`,
          status,
          price_nok: 100,
          expires_at: new Date(Date.now() + 864e5).toISOString(),
          ...(status === "sold" ? { sold_at: soldAt } : {}),
        })),
      )
      .select("id, status, sold_at");
    expect(error).toBeNull();
    const { data: wish, error: wishError } = await admin
      .from("wtb_listings")
      .insert({
        user_id: userId,
        title: "Ønsker en sykkel",
        status: "fulfilled",
      })
      .select("id")
      .single();
    expect(wishError).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const archived = await admin.from("listings").select("status").eq("seller_id", userId);
    expect(archived.data?.every((row) => row.status === "archived")).toBe(true);
    const cancelled = await owner.rpc("cancel_account_deletion");
    expect(cancelled.error).toBeNull();
    expect(cancelled.data).toBe(true);
    const restored = await admin
      .from("listings")
      .select("id, status, sold_at")
      .eq("seller_id", userId);
    expect(restored.data).toEqual(expect.arrayContaining(listings!));
    expect(
      (await admin.from("wtb_listings").select("status").eq("id", wish!.id).single()).data?.status,
    ).toBe("fulfilled");
    expect((await owner.rpc("cancel_account_deletion")).data).toBe(false);
  });
  it("gjør ikke en utløpt aktiv annonse aktiv igjen", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Utløper mens sletting ventes",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    await admin
      .from("listings")
      .update({ expires_at: new Date(Date.now() - 864e5).toISOString() })
      .eq("id", listing!.id);
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("expired");
  });
  it("respekterer en publiseringssperre som kom etter slettingsforespørselen", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Blir sperret under sletting",
        status: "active",
        price_nok: 100,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const ban = await admin
      .from("user_bans")
      .insert({ user_id: userId, reason: "Local restoration test", banned_by: userId });
    expect(ban.error).toBeNull();
    try {
      const cancelled = await owner.rpc("cancel_account_deletion");
      expect(cancelled.error).toBeNull();
      expect(cancelled.data).toBe(true);
      expect(
        (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
      ).toBe("disabled");
    } finally {
      await admin.from("user_bans").delete().eq("user_id", userId);
    }
  });
  it("beholder annonsesperren etter gjentatt slettingsforespørsel og avbrudd", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Sperres mens sletting ventes",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect(
      (await admin.from("listings").update({ status: "disabled" }).eq("id", listing!.id)).error,
    ).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("disabled");
  });
  it("gjenoppretter annonser opprettet mellom to slettingsforespørsler", async () => {
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Opprettet mellom forespørslene",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("active");
  });
});
