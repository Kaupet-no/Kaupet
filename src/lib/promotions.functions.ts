import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTestHost } from "@/lib/env";


export const activateDemoPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listing_id: z.string().uuid(),
        duration_days: z.number().int().positive().max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: promoId, error } = await supabase.rpc("demo_activate_promotion", {
      _listing_id: data.listing_id,
      _duration_days: data.duration_days,
    });
    if (error) throw error;
    return { promotion_id: promoId as string };
  });


export const getPromotionPricing = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("promotion_pricing")
    .select("duration_days, price_nok")
    .eq("active", true)
    .order("duration_days");
  if (error) throw error;
  return data ?? [];
});

export const createPromotionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listing_id: z.string().uuid(),
        duration_days: z.number().int().positive().max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify ownership and active listing
    const { data: listing, error: lerr } = await supabase
      .from("listings")
      .select("id, seller_id, status, title")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (lerr) throw lerr;
    if (!listing) throw new Error("Annonsen finnes ikke");
    if (listing.seller_id !== userId) throw new Error("Du eier ikke denne annonsen");
    if (listing.status !== "active") throw new Error("Annonsen må være aktiv for å fremheves");

    // Get price
    const { data: pricing, error: perr } = await supabaseAdmin
      .from("promotion_pricing")
      .select("price_nok")
      .eq("duration_days", data.duration_days)
      .eq("active", true)
      .maybeSingle();
    if (perr) throw perr;
    if (!pricing) throw new Error("Ugyldig pakkevarighet");

    // Block if an active or pending promotion exists
    const { data: existing } = await supabaseAdmin
      .from("listing_promotions")
      .select("id, status")
      .eq("listing_id", data.listing_id)
      .in("status", ["active", "pending", "gifted"])
      .maybeSingle();
    if (existing) {
      throw new Error("Denne annonsen har allerede en aktiv eller ventende fremheving");
    }

    // Create pending row
    const reference = `kaupet-promo-${crypto.randomUUID()}`;
    const { data: promo, error: ierr } = await supabaseAdmin
      .from("listing_promotions")
      .insert({
        listing_id: data.listing_id,
        user_id: userId,
        duration_days: data.duration_days,
        price_nok: pricing.price_nok,
        status: "pending",
        vipps_reference: reference,
      })
      .select("id")
      .single();
    if (ierr) throw ierr;

    const { createVippsPayment } = await import("@/lib/vipps.server");
    const host = (() => {
      try {
        return getRequestHost();
      } catch {
        return null;
      }
    })();
    const origin = host
      ? `https://${host}`
      : (process.env.PUBLIC_SITE_URL ??
        (isTestHost(host) ? "https://test.kaupet.no" : "https://kaupet.no"));
    const returnUrl = `${origin}/annonse/${data.listing_id}?promotion=success&promo_id=${promo.id}`;

    try {
      const result = await createVippsPayment({
        reference,
        amountNok: pricing.price_nok,
        description: `Fremheving av annonse ${data.duration_days} dager — ${listing.title}`.slice(
          0,
          95,
        ),
        returnUrl,
        idempotencyKey: promo.id,
        host,
      });
      if (result.pspReference) {
        await supabaseAdmin
          .from("listing_promotions")
          .update({ vipps_psp_reference: result.pspReference })
          .eq("id", promo.id);
      }
      return { promotion_id: promo.id, redirect_url: result.redirectUrl };

    } catch (err) {
      await supabaseAdmin
        .from("listing_promotions")
        .update({ status: "failed" })
        .eq("id", promo.id);
      throw err;
    }
  });

export const getPromotionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ promotion_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: promo, error } = await supabase
      .from("listing_promotions")
      .select("id, status, expires_at, starts_at, duration_days, listing_id, user_id")
      .eq("id", data.promotion_id)
      .maybeSingle();
    if (error) throw error;
    if (!promo) throw new Error("Fant ikke fremheving");
    if (promo.user_id !== userId) throw new Error("Ikke tilgang");
    return promo;
  });

export const getMyActivePromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("listing_promotions")
      .select("id, listing_id, status, starts_at, expires_at, duration_days, is_gift")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getFeaturedListings = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        category_slug: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: idRows, error: idErr } = await supabaseAdmin.rpc("get_featured_listing_ids", {
      _category_slug: data.category_slug ?? undefined,
      _limit: data.limit ?? 2,
    });
    if (idErr) throw idErr;
    const ids = (idRows ?? []).map((r: { listing_id: string }) => r.listing_id);
    if (ids.length === 0) return [];

    const { data: listings, error } = await supabaseAdmin
      .from("listings")
      .select(
        "id, kaupet_code, title, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
      )
      .in("id", ids)
      .eq("status", "active");
    if (error) throw error;
    return (listings ?? []).map((l) => {
      const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      return {
        id: l.id,
        kaupet_code: l.kaupet_code,
        title: l.title,
        price_nok: l.price_nok,
        is_free: l.is_free,
        city: l.city,
        created_at: l.created_at,
        cover_path: imgs[0]?.storage_path ?? null,
      };
    });
  });
