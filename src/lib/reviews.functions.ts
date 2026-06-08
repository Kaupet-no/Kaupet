import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewRow = {
  id: string;
  listing_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role: "buyer" | "seller";
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  listing: { id: string; title: string } | null;
};

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  location: string | null;
  bio: string | null;
  created_at: string;
  deleted_at: string | null;
  avg_rating: number;
  review_count: number;
};

export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listingId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sale, error: saleErr } = await supabase
      .from("listing_sales")
      .select("seller_id, buyer_id")
      .eq("listing_id", data.listingId)
      .maybeSingle();
    if (saleErr) throw new Error(saleErr.message);
    if (!sale) throw new Error("Det finnes ingen bekreftet kjøper for denne annonsen");

    let role: "buyer" | "seller";
    let revieweeId: string;
    if (sale.buyer_id === userId) {
      role = "buyer";
      revieweeId = sale.seller_id;
    } else if (sale.seller_id === userId) {
      role = "seller";
      revieweeId = sale.buyer_id;
    } else {
      throw new Error("Du er ikke part i dette salget");
    }

    const { error } = await supabase.from("user_reviews").insert({
      listing_id: data.listingId,
      reviewer_id: userId,
      reviewee_id: revieweeId,
      role,
      rating: data.rating,
      comment: data.comment ? data.comment : null,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error("Du har allerede gitt en vurdering for dette salget");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const getMyReviewForListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_reviews")
      .select("id, rating, comment, created_at, role")
      .eq("listing_id", data.listingId)
      .eq("reviewer_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const getPublicProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PublicProfile | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, location, bio, created_at, deleted_at")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) return null;

    const { data: summary } = await supabaseAdmin.rpc("user_review_summary", {
      _user_id: data.userId,
    });
    const row = Array.isArray(summary) ? summary[0] : summary;
    return {
      id: profile.id,
      display_name: profile.deleted_at ? "Slettet bruker" : profile.display_name,
      avatar_url: profile.deleted_at ? null : profile.avatar_url,
      location: profile.deleted_at ? null : profile.location,
      bio: profile.deleted_at ? null : profile.bio,
      created_at: profile.created_at,
      deleted_at: profile.deleted_at,
      avg_rating: Number(row?.avg_rating ?? 0),
      review_count: Number(row?.review_count ?? 0),
    };
  });

export const listUserReviews = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ReviewRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 20;
    const offset = data.offset ?? 0;
    const { data: rows, error } = await supabaseAdmin
      .from("user_reviews")
      .select(
        `id, listing_id, reviewer_id, reviewee_id, role, rating, comment, created_at,
         reviewer:profiles!user_reviews_reviewer_id_fkey(id, display_name, avatar_url),
         listing:listings(id, title)`,
      )
      .eq("reviewee_id", data.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // Fallback if FK alias not recognised
      const { data: plain, error: e2 } = await supabaseAdmin
        .from("user_reviews")
        .select("id, listing_id, reviewer_id, reviewee_id, role, rating, comment, created_at")
        .eq("reviewee_id", data.userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (e2) throw new Error(e2.message);
      const ids = Array.from(new Set((plain ?? []).map((r) => r.reviewer_id)));
      const listingIds = Array.from(new Set((plain ?? []).map((r) => r.listing_id)));
      const [{ data: profs }, { data: listings }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, display_name, avatar_url, deleted_at")
          .in("id", ids),
        supabaseAdmin.from("listings").select("id, title").in("id", listingIds),
      ]);
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      const lmap = new Map((listings ?? []).map((l) => [l.id, l]));
      return (plain ?? []).map((r) => {
        const p = pmap.get(r.reviewer_id);
        return {
          ...r,
          role: r.role as "buyer" | "seller",
          reviewer: p
            ? {
                id: p.id,
                display_name: p.deleted_at ? "Slettet bruker" : p.display_name,
                avatar_url: p.deleted_at ? null : p.avatar_url,
              }
            : null,
          listing: lmap.get(r.listing_id) ?? null,
        };
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => {
      const reviewer = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
      const listing = Array.isArray(r.listing) ? r.listing[0] : r.listing;
      return {
        ...r,
        role: r.role as "buyer" | "seller",
        reviewer: reviewer ?? null,
        listing: listing ?? null,
      };
    });
  });
