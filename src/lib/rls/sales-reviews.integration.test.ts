/** RLS integration tests: sales-reviews. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
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

describe.skipIf(!canRun)(
  "RLS: listing_sales — visible only to participants, only seller can confirm/undo",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-sale-seller-${suffix}@example.com`,
      buyer: `rls-sale-buyer-${suffix}@example.com`,
      other: `rls-sale-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let buyerId: string;
    let otherId: string;
    let listingId: string;
    let conversationId: string;

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
      sellerId = await mkUser(emails.seller);
      buyerId = await mkUser(emails.buyer);
      otherId = await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS sale test listing",
          price_nok: 100,
          status: "active",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = conv.id;

      const { error: saleErr } = await admin.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: sellerId,
        buyer_id: buyerId,
        conversation_id: conversationId,
      });
      if (saleErr) throw saleErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets both the buyer and seller see the confirmed sale", async () => {
      const seller = await signIn(emails.seller);
      const { data: sellerData, error: sellerErr } = await seller
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(sellerErr).toBeNull();
      expect(sellerData).toHaveLength(1);

      const buyer = await signIn(emails.buyer);
      const { data: buyerData, error: buyerErr } = await buyer
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(buyerErr).toBeNull();
      expect(buyerData).toHaveLength(1);
    });

    it("hides the sale from an unrelated authenticated user and from anon", async () => {
      const other = await signIn(emails.other);
      const { data: otherData, error: otherErr } = await other
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(otherErr).toBeNull();
      expect(otherData).toHaveLength(0);

      const anon = createClient(URL!, ANON_KEY!);
      const { data: anonData, error: anonErr } = await anon
        .from("listing_sales")
        .select("listing_id")
        .eq("listing_id", listingId);
      expect(anonErr).toBeNull();
      expect(anonData).toHaveLength(0);
    });

    it("blocks a non-participant from confirming a sale using someone else's conversation", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: otherId,
        buyer_id: buyerId,
        conversation_id: conversationId,
      });
      expect(error).not.toBeNull();
    });

    it("blocks the buyer from undoing (deleting) the sale — only the seller can", async () => {
      const buyer = await signIn(emails.buyer);
      const { error, count } = await buyer
        .from("listing_sales")
        .delete({ count: "exact" })
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: user_reviews — readable by any authenticated user, writable only by the matching sale's participant",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-review-seller-${suffix}@example.com`,
      buyer: `rls-review-buyer-${suffix}@example.com`,
      other: `rls-review-other-${suffix}@example.com`,
    };

    const userIds: string[] = [];
    let sellerId: string;
    let buyerId: string;
    let listingId: string;

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
      sellerId = await mkUser(emails.seller);
      buyerId = await mkUser(emails.buyer);
      await mkUser(emails.other);

      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS review test listing",
          price_nok: 100,
          status: "sold",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;

      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();
      if (convErr) throw convErr;

      const { error: saleErr } = await admin.from("listing_sales").insert({
        listing_id: listingId,
        seller_id: sellerId,
        buyer_id: buyerId,
        conversation_id: conv.id,
      });
      if (saleErr) throw saleErr;

      const { error: reviewErr } = await admin.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: buyerId,
        reviewee_id: sellerId,
        role: "buyer",
        rating: 5,
      });
      if (reviewErr) throw reviewErr;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets any authenticated user read the review, even an unrelated one", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("user_reviews")
        .select("id")
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("lets an anonymous visitor read the review too (reputation data is public)", async () => {
      // The SELECT policy went through two revisions: tightened to
      // `TO authenticated` in 20260605123044_*.sql, then reopened to
      // everyone (including anon, with a matching GRANT) in
      // 20260610102257_*.sql — reviews are reputation data, meant to be
      // publicly visible like a seller's star rating.
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon
        .from("user_reviews")
        .select("id")
        .eq("listing_id", listingId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("blocks submitting a review that doesn't match the confirmed sale (wrong role/party)", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: buyerId,
        reviewee_id: sellerId,
        role: "seller",
        rating: 1,
      });
      expect(error).not.toBeNull();
    });

    it("blocks a user from submitting a review as someone else", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: sellerId,
        reviewee_id: buyerId,
        role: "seller",
        rating: 3,
      });
      expect(error).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("RLS: listing sales cannot be removed after reviews", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-sale-integrity-seller-${suffix}@example.com`,
    buyer: `rls-sale-integrity-buyer-${suffix}@example.com`,
    outsider: `rls-sale-integrity-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const conversationIds: string[] = [];
  let sellerId: string;
  let buyerId: string;

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, emails.seller, userIds);
    buyerId = await createRlsUser(admin, emails.buyer, userIds);
    await createRlsUser(admin, emails.outsider, userIds);
  });

  afterAll(async () => {
    if (!canRun) return;
    for (const listingId of listingIds) {
      const { error: reviewError } = await admin
        .from("user_reviews")
        .delete()
        .eq("listing_id", listingId);
      if (reviewError) throw reviewError;
      const { error: saleError } = await admin
        .from("listing_sales")
        .delete()
        .eq("listing_id", listingId);
      if (saleError) throw saleError;
    }
    if (conversationIds.length) {
      const { error } = await admin.from("conversations").delete().in("id", conversationIds);
      if (error) throw error;
    }
    if (listingIds.length) {
      const { error } = await admin.from("listings").delete().in("id", listingIds);
      if (error) throw error;
    }
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  async function createSale() {
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS sale integrity listing",
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingIds.push(listing.id);

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({ listing_id: listing.id, buyer_id: buyerId, seller_id: sellerId })
      .select("id")
      .single();
    if (conversationError) throw conversationError;
    conversationIds.push(conversation.id);

    const { error: saleError } = await admin.from("listing_sales").insert({
      listing_id: listing.id,
      seller_id: sellerId,
      buyer_id: buyerId,
      conversation_id: conversation.id,
    });
    if (saleError) throw saleError;
    return listing.id;
  }

  it("allows the seller to delete a sale without reviews", async () => {
    const listingId = await createSale();
    const seller = await signInWithRetry(emails.seller);
    const { error, count } = await seller
      .from("listing_sales")
      .delete({ count: "exact" })
      .eq("listing_id", listingId);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it("denies sale deletion to an outsider and anonymous visitor", async () => {
    const listingId = await createSale();
    const outsider = await signInWithRetry(emails.outsider);
    const { error: outsiderError, count } = await outsider
      .from("listing_sales")
      .delete({ count: "exact" })
      .eq("listing_id", listingId);
    expect(outsiderError).toBeNull();
    expect(count).toBe(0);

    const anon = createClient(URL!, ANON_KEY!);
    const { error: anonError, count: anonCount } = await anon
      .from("listing_sales")
      .delete({ count: "exact" })
      .eq("listing_id", listingId);
    expect(anonError).toBeNull();
    expect(anonCount).toBe(0);
    const { data: sale, error: readError } = await admin
      .from("listing_sales")
      .select("listing_id")
      .eq("listing_id", listingId)
      .single();
    expect(readError).toBeNull();
    expect(sale).not.toBeNull();
  });

  it("refuses seller deletion after a review", async () => {
    const listingId = await createSale();
    const buyer = await signInWithRetry(emails.buyer);
    const { error: reviewError } = await buyer.from("user_reviews").insert({
      listing_id: listingId,
      reviewer_id: buyerId,
      reviewee_id: sellerId,
      role: "buyer",
      rating: 5,
    });
    expect(reviewError).toBeNull();

    const seller = await signInWithRetry(emails.seller);
    const { error } = await seller.from("listing_sales").delete().eq("listing_id", listingId);
    expect(error?.code).toBe("23514");
    expect(error?.message).toBe("Salget kan ikke angres etter at vurderinger er gitt");
    const { data: sale, error: readError } = await admin
      .from("listing_sales")
      .select("listing_id")
      .eq("listing_id", listingId)
      .single();
    expect(readError).toBeNull();
    expect(sale).not.toBeNull();
  });

  it("serializes simultaneous review insertion and sale deletion without an orphan review", async () => {
    const listingId = await createSale();
    const buyer = await signInWithRetry(emails.buyer);
    const seller = await signInWithRetry(emails.seller);
    const [reviewResult, deleteResult] = await Promise.all([
      buyer.from("user_reviews").insert({
        listing_id: listingId,
        reviewer_id: buyerId,
        reviewee_id: sellerId,
        role: "buyer",
        rating: 4,
      }),
      seller.from("listing_sales").delete().eq("listing_id", listingId),
    ]);

    const { data: sale, error: saleReadError } = await admin
      .from("listing_sales")
      .select("listing_id")
      .eq("listing_id", listingId)
      .maybeSingle();
    const { data: reviews, error: reviewReadError } = await admin
      .from("user_reviews")
      .select("id")
      .eq("listing_id", listingId);
    expect(saleReadError).toBeNull();
    expect(reviewReadError).toBeNull();
    if (!reviewResult.error) {
      expect(sale).not.toBeNull();
      expect(deleteResult.error?.code).toBe("23514");
      expect(reviews).toHaveLength(1);
    } else {
      expect(sale).toBeNull();
      expect(reviews).toHaveLength(0);
    }
  });
});
