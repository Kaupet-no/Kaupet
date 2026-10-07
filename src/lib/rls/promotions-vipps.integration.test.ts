/** RLS integration tests: promotions-vipps. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
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
  // The public-read policy ("Anyone can read active promotions") was dropped
  // in 20260608194322_*.sql without a replacement — public "featured
  // listing" visibility now goes exclusively through the SECURITY DEFINER
  // get_featured_listing_ids() RPC, not a direct table SELECT. Only the
  // owner (and admins, via a separate policy) can read this table directly.
  "RLS: listing_promotions — only owner/admin can read, no public/anon access",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-promo-owner-${suffix}@example.com`,
      other: `rls-promo-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    const listingIds: string[] = [];
    let ownerId: string;
    let pendingPromoId: string;
    let activePromoId: string;

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

      const mkListing = async (title: string) => {
        const { data, error } = await admin
          .from("listings")
          .insert({ seller_id: ownerId, title, price_nok: 100, status: "active" })
          .select("id")
          .single();
        if (error) throw error;
        listingIds.push(data.id);
        return data.id;
      };
      const pendingListingId = await mkListing("RLS promo pending listing");
      const activeListingId = await mkListing("RLS promo active listing");

      const { data: pending, error: pendingErr } = await admin
        .from("listing_promotions")
        .insert({
          listing_id: pendingListingId,
          user_id: ownerId,
          duration_days: 3,
          price_nok: 49,
          status: "pending",
          purchase_terms_version: "2.0",
          purchase_terms_accepted_at: "2026-10-07T12:00:00Z",
          purchase_acceptance_text: "Jeg har lest vilkår for kjøp — testaksept.",
        })
        .select("id")
        .single();
      if (pendingErr) throw pendingErr;
      pendingPromoId = pending.id;

      const { data: active, error: activeErr } = await admin
        .from("listing_promotions")
        .insert({
          listing_id: activeListingId,
          user_id: ownerId,
          duration_days: 3,
          price_nok: 49,
          status: "active",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (activeErr) throw activeErr;
      activePromoId = active.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("listing_promotions").delete().in("id", [pendingPromoId, activePromoId]);
      await admin.from("listings").delete().in("id", listingIds);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    // PAY-16: purchase evidence follows the existing owner/admin RLS.
    it("eieren kan lese sin registrerte kjøpsaksept", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("listing_promotions")
        .select("purchase_terms_version, purchase_terms_accepted_at, purchase_acceptance_text")
        .eq("id", pendingPromoId)
        .single();
      expect(error).toBeNull();
      expect(data?.purchase_terms_version).toBe("2.0");
      expect(data?.purchase_acceptance_text).toBe("Jeg har lest vilkår for kjøp — testaksept.");
      expect(Date.parse(data!.purchase_terms_accepted_at!)).toBe(
        Date.parse("2026-10-07T12:00:00Z"),
      );
    });

    it("eieren kan ikke endre kjøpsbevis eller betalingsstatus direkte", async () => {
      const owner = await signIn(emails.owner);
      const { data } = await owner
        .from("listing_promotions")
        .update({ status: "active", purchase_terms_version: "forfalsket" })
        .eq("id", pendingPromoId)
        .select("id");
      expect(data ?? []).toHaveLength(0);
      const { data: stored, error } = await admin
        .from("listing_promotions")
        .select("status, purchase_terms_version")
        .eq("id", pendingPromoId)
        .single();
      expect(error).toBeNull();
      expect(stored).toMatchObject({ status: "pending", purchase_terms_version: "2.0" });
    });

    it("databasen avviser ufullstendig kjøpsaksept", async () => {
      const { error } = await admin
        .from("listing_promotions")
        .update({ purchase_terms_accepted_at: null })
        .eq("id", pendingPromoId);
      expect(error?.code).toBe("23514");
    });

    it("lets the owner see both their pending and active promotion", async () => {
      const owner = await signIn(emails.owner);
      const { data, error } = await owner
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(new Set(data?.map((p) => p.id))).toEqual(new Set([pendingPromoId, activePromoId]));
    });

    it("hides both promotions from an unrelated non-admin user, active included", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("hides both promotions from anonymous visitors, active included", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("listing_promotions")
        .select("id")
        .in("id", [pendingPromoId, activePromoId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: vipps_webhook_secrets and vipps_webhook_events never leak to authenticated clients",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const email = `rls-vipps-${suffix}@example.com`;
    const userIds: string[] = [];
    let webhookEventId: string;

    async function signIn() {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);

      const { data: event, error: eventErr } = await admin
        .from("vipps_webhook_events")
        .insert({
          event_id: `rls-test-event-${suffix}`,
          reference: "rls-test",
          event_name: "test.event",
          payload: {},
        })
        .select("id")
        .single();
      if (eventErr) throw eventErr;
      webhookEventId = event.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("vipps_webhook_events").delete().eq("id", webhookEventId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("never returns vipps_webhook_secrets rows to a regular authenticated client", async () => {
      // Doesn't insert its own row — vipps_webhook_secrets holds real
      // production webhook config, not test-safe to write to. Verified
      // instead against whatever real rows already exist (any environment
      // running Vipps promotions has at least one).
      const client = await signIn();
      const { data, error } = await client.from("vipps_webhook_secrets").select("id");
      // Either outcome is acceptable — a grant-level permission error, or an
      // empty result from RLS default-deny (this table has zero policies).
      // What must never happen is `data` containing any real rows.
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data?.length ?? 0).toBe(0);
      }
    });

    it("never returns vipps_webhook_events rows to a non-admin authenticated client", async () => {
      const client = await signIn();
      const { data, error } = await client
        .from("vipps_webhook_events")
        .select("id")
        .eq("id", webhookEventId);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  },
);
