import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WtbListing = {
  id: string;
  user_id: string;
  title: string;
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
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional(),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
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
        description: data.description ?? null,
        category_id: data.category_id ?? null,
        max_price_nok: data.max_price_nok ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const updateWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).merge(wtbInputSchema).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .update({
        title: data.title,
        description: data.description ?? null,
        category_id: data.category_id ?? null,
        max_price_nok: data.max_price_nok ?? null,
      })
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
    const { data, error } = await supabase
      .from("wtb_listings")
      .select("*, categories(name_nb, slug)")
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
