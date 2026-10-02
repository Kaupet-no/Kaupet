/** RLS integration tests: wtb. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)(
  "RLS: wtb_listings — owner sees own regardless of status, others see only active",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-wtb-owner-${suffix}@example.com`,
      other: `rls-wtb-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let ownerId: string;
    let otherId: string;
    let activeId: string;
    let notifiedActiveId: string;
    let fulfilledId: string;
    let draftId: string;
    let activatableDraftId: string;
    let deletableDraftId: string;
    let matchingListingId: string;

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
      otherId = await mkUser(emails.other);

      const mkWtb = async (status: "draft" | "active" | "fulfilled", notifyMatches = false) => {
        const { data, error } = await admin
          .from("wtb_listings")
          .insert({
            user_id: ownerId,
            title: `RLS wtb ${status} listing`,
            status,
            notify_matches: notifyMatches,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      };
      activeId = await mkWtb("active");
      notifiedActiveId = await mkWtb("active", true);
      fulfilledId = await mkWtb("fulfilled");
      draftId = await mkWtb("draft");
      activatableDraftId = await mkWtb("draft");
      deletableDraftId = await mkWtb("draft");

      const { data: listing, error: listingError } = await admin
        .from("listings")
        .insert({
          seller_id: otherId,
          title: "Matching listing for WTB notification preference",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingError) throw listingError;
      matchingListingId = listing.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      const wtbIds = [
        activeId,
        notifiedActiveId,
        fulfilledId,
        draftId,
        activatableDraftId,
        deletableDraftId,
      ];
      await admin.from("wtb_match_notifications").delete().in("wtb_listing_id", wtbIds);
      await admin.from("listings").delete().eq("id", matchingListingId);
      await admin.from("wtb_listings").delete().in("id", wtbIds);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the owner see their active, fulfilled, and draft wtb listings", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("wtb_listings")
        .select("id")
        .in("id", [activeId, fulfilledId, draftId]);
      expect(error).toBeNull();
      expect(new Set(data?.map((w) => w.id))).toEqual(new Set([activeId, fulfilledId, draftId]));
    });

    it("hides fulfilled and draft listings from other users but shows the active one", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("wtb_listings")
        .select("id")
        .in("id", [activeId, fulfilledId, draftId]);
      expect(error).toBeNull();
      expect(data?.map((w) => w.id)).toEqual([activeId]);
    });

    it("hides draft listings from anonymous visitors", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon.from("wtb_listings").select("id").eq("id", draftId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("rejects direct WTB updates, including the owner path", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner
        .from("wtb_listings")
        .update({ title: "Updated private draft", status: "active" }, { count: "exact" })
        .eq("id", activatableDraftId);
      expect(error).not.toBeNull();
    });

    it("rejects direct WTB updates from other users", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("wtb_listings")
        .update({ status: "active" }, { count: "exact" })
        .eq("id", draftId);
      expect(error).not.toBeNull();
    });

    it("rejects direct WTB deletes; the server function owns deletion", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner
        .from("wtb_listings")
        .delete({ count: "exact" })
        .eq("id", deletableDraftId);
      expect(error).not.toBeNull();
    });

    it("creates WTB notifications only when the owner opted in", async () => {
      const { data, error } = await admin
        .from("wtb_match_notifications")
        .select("wtb_listing_id")
        .in("wtb_listing_id", [activeId, notifiedActiveId]);
      expect(error).toBeNull();
      expect(data?.map((row) => row.wtb_listing_id)).toEqual([notifiedActiveId]);
    });

    it("rejects direct WTB updates from another user", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("wtb_listings")
        .update({ title: "Hijacked" }, { count: "exact" })
        .eq("id", activeId);
      expect(error).not.toBeNull();
    });

    it("blocks a user from creating a wtb listing on someone else's behalf", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("wtb_listings")
        .insert({ user_id: ownerId, title: "Impersonated wtb listing" });
      expect(error).not.toBeNull();
    });
  },
);
