import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** WTB criteria value shapes (see src/features/wtb/wtb-criteria-types.ts):
 * multi-value selects (string[]), from–to ranges ({min,max}), earliest-date
 * ({minDate}) plus the plain scalar shapes older listings stored. Deliberately
 * separate from the stricter shared `attributesSchema`, which sell listings
 * keep using. */
const wtbAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict(),
  z.object({ minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
]);
const wtbAttributesSchema = z.record(z.string(), wtbAttributeValueSchema);

export type WtbListing = {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category_id: string | null;
  max_price_nok: number | null;
  status: "active" | "fulfilled" | "expired" | "archived";
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type WtbListingWithProfile = WtbListing & {
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  categories: { name_nb: string; slug: string } | null;
};

const wtbInputSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  subtitle: z.string().trim().max(80, "Maks 80 tegn").nullable().optional(),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional(),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
  // Filters are always optional for WTB listings — never enforced server-side.
  attributes: wtbAttributesSchema.optional(),
});

export const createWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wtbInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("wtb_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 10) {
      throw new Error(
        "Du har opprettet for mange ønskes kjøpt-annonser den siste timen. Prøv igjen senere.",
      );
    }

    const { data: row, error } = await supabaseAdmin
      .from("wtb_listings")
      .insert({
        user_id: userId,
        title: data.title,
        subtitle: data.subtitle ?? null,
        description: data.description ?? null,
        category_id: data.category_id ?? null,
        max_price_nok: data.max_price_nok ?? null,
        attributes: data.attributes ?? {},
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

const wtbUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(3, "Tittelen må være minst 3 tegn")
    .max(120, "Maks 120 tegn")
    .optional(),
  subtitle: z.string().trim().max(80, "Maks 80 tegn").nullable().optional(),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional(),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
  attributes: wtbAttributesSchema.optional(),
  status: z.enum(["active", "fulfilled", "archived"]).optional(),
});

export const updateWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wtbUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const fields = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category_id !== undefined && { category_id: data.category_id }),
      ...(data.max_price_nok !== undefined && { max_price_nok: data.max_price_nok }),
      ...(data.attributes !== undefined && { attributes: data.attributes }),
      ...(data.status !== undefined && { status: data.status }),
    };

    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .update(fields)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
  });

export const deleteWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
  });

export const getMyWtbListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("wtb_listings")
      .select("*, categories(name_nb, slug)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as (WtbListing & {
      categories: { name_nb: string; slug: string } | null;
    })[];
  });

const listWtbSchema = z.object({
  q: z.string().optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const listWtbListings = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listWtbSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("wtb_listings")
      .select("*, profiles(display_name, avatar_url), categories(name_nb, slug)", {
        count: "exact",
      })
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.q?.trim()) {
      query = query.textSearch("search_vector", data.q.trim(), {
        type: "websearch",
        config: "norwegian",
      });
    }
    if (data.categories?.length) {
      query = query.in("category_id", data.categories);
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;
    return { rows: (rows ?? []) as WtbListingWithProfile[], total: count ?? 0 };
  });

export const countWtbListings = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().optional(), categories: z.array(z.string()).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("wtb_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    if (data.q?.trim()) {
      query = query.textSearch("search_vector", data.q.trim(), {
        type: "websearch",
        config: "norwegian",
      });
    }
    if (data.categories?.length) {
      query = query.in("category_id", data.categories);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  });

export const matchWtbListingsForListing = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ title: z.string().min(1), category_id: z.string().uuid().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const words = data.title
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 6)
      .join(" | ");

    if (!words) return { count: 0, maxPrice: null };

    let query = supabaseAdmin
      .from("wtb_listings")
      .select("max_price_nok", { count: "exact" })
      .eq("status", "active")
      .textSearch("search_vector", words, { type: "plain", config: "norwegian" });

    if (data.category_id) {
      query = query.eq("category_id", data.category_id);
    }

    const { data: rows, count, error } = await query;
    if (error) return { count: 0, maxPrice: null };

    const prices = (rows ?? []).map((r) => r.max_price_nok).filter((p): p is number => p != null);
    const maxPrice = prices.length ? Math.max(...prices) : null;
    return { count: count ?? 0, maxPrice };
  });
