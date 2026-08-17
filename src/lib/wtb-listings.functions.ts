import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { attributesSchema } from "@/lib/category-filters";

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
  notify_matches: boolean;
  status: "draft" | "active" | "fulfilled" | "expired" | "archived";
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type WtbListingWithProfile = WtbListing & {
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  categories: { name_nb: string; slug: string } | null;
};

const wtbInputSchema = z.object({
  draftId: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  subtitle: z.string().trim().max(80, "Maks 80 tegn").nullable().optional(),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional(),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
  notify_matches: z.boolean().optional(),
  // Filters are always optional for WTB listings — never enforced server-side.
  attributes: wtbAttributesSchema.optional(),
});

export const createWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => wtbInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const fields = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category_id: data.category_id ?? null,
      max_price_nok: data.max_price_nok ?? null,
      notify_matches: data.notify_matches ?? false,
      attributes: data.attributes ?? {},
    };

    if (data.draftId) {
      const { data: row, error } = await supabaseAdmin
        .from("wtb_listings")
        .update({ ...fields, status: "active" })
        .eq("id", data.draftId)
        .eq("user_id", userId)
        .eq("status", "draft")
        .select("id")
        .single();
      if (error) throw error;
      return { id: row.id as string };
    }

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
        ...fields,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const saveWtbDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    wtbInputSchema
      .omit({ draftId: true })
      .extend({
        id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fields = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category_id: data.category_id ?? null,
      max_price_nok: data.max_price_nok ?? null,
      attributes: data.attributes ?? {},
    };

    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("wtb_listings")
        .update(fields)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .eq("status", "draft")
        .select("id")
        .single();
      if (error) throw error;
      return { id: row.id as string };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("wtb_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("status", "draft")
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 10) throw new Error("For mange utkast. Prøv igjen senere.");

    const { data: row, error } = await supabaseAdmin
      .from("wtb_listings")
      .insert({ user_id: context.userId, status: "draft", ...fields })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const getLatestWtbDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wtb_listings")
      .select("id, title, description, category_id, max_price_nok, attributes, updated_at")
      .eq("user_id", context.userId)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const discardWtbDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "draft");
    if (error) throw error;
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
  .validator((input: unknown) => wtbUpdateSchema.parse(input))
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
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
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
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as (WtbListing & {
      categories: { name_nb: string; slug: string } | null;
    })[];
    let hasDraft = false;
    return rows.filter((row) => {
      if (row.status !== "draft") return true;
      if (hasDraft) return false;
      hasDraft = true;
      return true;
    });
  });

const listWtbSchema = z.object({
  q: z.string().optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const listWtbListings = createServerFn({ method: "GET" })
  .validator((input: unknown) => listWtbSchema.parse(input))
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
  .validator((input: unknown) =>
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

/** Fase 4 av ØK-matching: brukes av prisstegets "N brukere ønsker å kjøpe
 * noe lignende"-banner mens brukeren fortsatt fyller ut opprettelsesflyten
 * (annonsen finnes ikke i databasen ennå). Kaller wtb_match_count-RPC-en,
 * som gjenbruker den samme compute_wtb_matches-sammenligningen som faktisk
 * skriver treffvarsler ved publisering — banneret reflekterer derfor ekte
 * attributt-treff, ikke bare tittel-tekstoverlapp som tidligere. */
export const matchWtbListingsForListing = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        title: z.string(),
        description: z.string().optional(),
        category_id: z.string().uuid().nullable().optional(),
        price_nok: z.number().int().nullable().optional(),
        is_free: z.boolean().optional(),
        // Selgerens (pågående) annonseattributter — sell-flytens
        // attributesSchema, IKKE ØK-kriterieformen (wtbAttributesSchema
        // over), som er noe helt annet (aksepterte verdier, ikke faktiske).
        attributes: attributesSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("wtb_match_count", {
      _category_id: data.category_id ?? null,
      _price_nok: data.price_nok ?? null,
      _is_free: data.is_free ?? false,
      _title: data.title,
      _description: data.description ?? null,
      _attributes: data.attributes ?? {},
    });
    if (error || !rows?.[0]) return { count: 0, maxPrice: null };

    return { count: rows[0].match_count ?? 0, maxPrice: rows[0].max_price ?? null };
  });

/** Varsel om at en ny/endret annonse matcher kriteriene i en av brukerens
 * egne ØK-annonser (skrevet av match_listing_to_wtb_listings — se
 * supabase/migrations/20260805100500_wtb_matching_engine.sql). Speiler
 * SavedSearchNotification/listNotifications-mønsteret i saved-searches.ts. */
export type WtbMatchNotification = {
  id: string;
  wtb_listing_id: string;
  listing_id: string;
  read_at: string | null;
  created_at: string;
};

export async function listWtbMatchNotifications(limit = 30, offset = 0) {
  const { data, error } = await supabase
    .from("wtb_match_notifications")
    .select("id, wtb_listing_id, listing_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as WtbMatchNotification[];
}

export async function markWtbMatchNotificationRead(id: string) {
  const { error } = await supabase
    .from("wtb_match_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllWtbMatchNotificationsRead() {
  const { error } = await supabase
    .from("wtb_match_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteWtbMatchNotification(id: string) {
  const { error } = await supabase.from("wtb_match_notifications").delete().eq("id", id);
  if (error) throw error;
}
