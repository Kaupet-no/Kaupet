import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(5).max(120),
        description: z.string().trim().min(20).max(4000),
        category_id: z.string().uuid(),
        condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]),
        is_free: z.boolean(),
        price_nok: z.number().int().min(0).max(10_000_000).nullable(),
        postal_code: z
          .string()
          .regex(/^\d{4}$/)
          .nullable(),
        city: z.string().max(100).nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        can_ship: z.boolean(),
        turnstileToken: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!data.turnstileToken) throw new Error("Turnstile-validering feilet. Prøv igjen.");
      const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: data.turnstileToken,
        }),
      });
      const cfJson = (await cfRes.json()) as { success: boolean };
      if (!cfJson.success) throw new Error("Turnstile-validering feilet. Prøv igjen.");
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 5) {
      throw new Error("Du har publisert for mange annonser den siste timen. Prøv igjen senere.");
    }

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({
        seller_id: userId,
        title: data.title,
        description: data.description,
        category_id: data.category_id,
        condition: data.condition,
        is_free: data.is_free,
        price_nok: data.is_free ? null : data.price_nok,
        postal_code: data.postal_code,
        city: data.city,
        lat: data.lat,
        lng: data.lng,
        can_ship: data.can_ship,
        status: "active",
        published_at: new Date().toISOString(),
      })
      .select("id, kaupet_code")
      .single();

    if (error) throw error;
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const republishListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, seller_id, status")
      .eq("id", data.id)
      .single();
    if (fetchError) throw fetchError;
    if (!listing || listing.seller_id !== userId) {
      throw new Error("Du har ikke tilgang til denne annonsen");
    }
    if (listing.status === "disabled") {
      throw new Error("Denne annonsen er deaktivert av moderator og kan ikke reaktiveres");
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error } = await supabase
      .from("listings")
      .update({
        status: "active",
        published_at: now,
        expires_at: expiresAt,
      })
      .eq("id", data.id)
      .select("id, status, published_at, expires_at")
      .single();
    if (error) throw error;

    return updated;
  });

export const getListingKaupetCodeById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ listing_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("listings")
      .select("kaupet_code")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (error) throw error;
    return { kaupet_code: row?.kaupet_code ?? null };
  });
