import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ikke autorisert");
}

export const adminListPromotionPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("promotion_pricing")
      .select("id, duration_days, price_nok, active, updated_at")
      .order("duration_days");
    if (error) throw error;
    return data ?? [];
  });

export const adminUpdatePromotionPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        duration_days: z.number().int().positive().max(60),
        price_nok: z.number().int().min(0).max(100000),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promotion_pricing").upsert(
      {
        duration_days: data.duration_days,
        price_nok: data.price_nok,
        active: data.active ?? true,
      },
      { onConflict: "duration_days" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const adminListPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        q: z.string().trim().max(120).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("listing_promotions")
      .select(
        "id, listing_id, user_id, duration_days, price_nok, status, is_gift, starts_at, expires_at, created_at, refunded_at, vipps_reference, vipps_psp_reference, listings(title, kaupet_code), profiles:user_id(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status)
      q = q.eq(
        "status",
        data.status as "active" | "expired" | "failed" | "gifted" | "pending" | "refunded",
      );
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.q && data.q.length > 0) {
      const term = data.q.replace(/[%,()]/g, "");
      q = q.or(`vipps_reference.ilike.%${term}%,vipps_psp_reference.ilike.%${term}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const adminGetVippsPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ promotion_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: promo, error } = await supabaseAdmin
      .from("listing_promotions")
      .select("id, status, price_nok, vipps_reference, is_gift")
      .eq("id", data.promotion_id)
      .maybeSingle();
    if (error) throw error;
    if (!promo) throw new Error("Fant ikke fremheving");
    if (promo.is_gift || !promo.vipps_reference) {
      return { hasVipps: false as const };
    }
    const { getVippsPayment, getVippsMode } = await import("@/lib/vipps.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const host = getRequest().headers.get("host");
    const mode = getVippsMode(host);
    try {
      const result = await getVippsPayment(promo.vipps_reference, host);
      const captured = result.state === "CAPTURED" || result.state === "AUTHORIZED";
      const failedStates = ["ABORTED", "EXPIRED", "CANCELLED", "TERMINATED", "FAILED"];
      const mismatch =
        (captured && (promo.status === "pending" || promo.status === "failed")) ||
        (result.state === "REFUNDED" && promo.status !== "refunded") ||
        (failedStates.includes(result.state) && promo.status === "active");
      return {
        hasVipps: true as const,
        mode,
        reference: promo.vipps_reference,
        state: result.state,
        pspReference: result.pspReference,
        amountNok: result.amount ? result.amount.value / 100 : undefined,
        mismatch,
      };
    } catch (e) {
      return {
        hasVipps: true as const,
        mode,
        reference: promo.vipps_reference,
        error: e instanceof Error ? e.message : "Ukjent feil fra Vipps",
      };
    }
  });

export const adminRefundPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ promotion_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: promo, error } = await supabaseAdmin
      .from("listing_promotions")
      .select("id, price_nok, vipps_reference, status, is_gift")
      .eq("id", data.promotion_id)
      .maybeSingle();
    if (error) throw error;
    if (!promo) throw new Error("Fant ikke fremheving");
    if (promo.is_gift) throw new Error("Gratis fremheving kan ikke refunderes");
    if (!promo.vipps_reference) throw new Error("Mangler Vipps-referanse");
    if (promo.status === "refunded") throw new Error("Allerede refundert");

    const { refundVippsPayment } = await import("@/lib/vipps.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const host = getRequest().headers.get("host");
    await refundVippsPayment(
      promo.vipps_reference,
      promo.price_nok,
      `refund-${promo.id}-${Date.now()}`,
      host,
    );

    await supabaseAdmin
      .from("listing_promotions")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", promo.id);

    await supabaseAdmin.from("admin_moderation_log").insert({
      admin_id: context.userId,
      action: "refund_promotion",
      target_type: "promotion",
      target_id: promo.id,
    });
    return { ok: true };
  });



export const adminGiftPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listing_id: z.string().uuid(),
        duration_days: z.number().int().positive().max(60),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: listing, error: lerr } = await supabaseAdmin
      .from("listings")
      .select("id, seller_id, status")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (lerr) throw lerr;
    if (!listing) throw new Error("Annonsen finnes ikke");
    if (listing.status !== "active") throw new Error("Annonsen må være aktiv");

    const { data: existing } = await supabaseAdmin
      .from("listing_promotions")
      .select("id")
      .eq("listing_id", data.listing_id)
      .in("status", ["active", "pending", "gifted"])
      .maybeSingle();
    if (existing) throw new Error("Annonsen har allerede en aktiv fremheving");

    const now = new Date();
    const expires = new Date(now.getTime() + data.duration_days * 24 * 60 * 60 * 1000);

    const { error } = await supabaseAdmin.from("listing_promotions").insert({
      listing_id: data.listing_id,
      user_id: listing.seller_id,
      duration_days: data.duration_days,
      price_nok: 0,
      status: "gifted",
      is_gift: true,
      gift_reason: data.reason,
      granted_by: context.userId,
      starts_at: now.toISOString(),
      expires_at: expires.toISOString(),
    });
    if (error) throw error;

    await supabaseAdmin.from("admin_moderation_log").insert({
      admin_id: context.userId,
      action: "gift_promotion",
      target_type: "listing",
      target_id: data.listing_id,
      reason: `${data.duration_days} dager — ${data.reason}`,
    });
    return { ok: true };
  });

export const adminSearchListingsForGift = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("listings")
      .select("id, title, city, status, profiles:seller_id(display_name)")
      .eq("status", "active")
      .ilike("title", `%${data.q}%`)
      .limit(20);
    if (error) throw error;
    return rows ?? [];
  });
