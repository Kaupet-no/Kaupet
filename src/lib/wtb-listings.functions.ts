import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { attributesSchema } from "@/lib/category-filters";
import { assertUserNotRateLimited } from "@/lib/rate-limit.server";

const WTB_CREATE_LIMIT_MESSAGE =
  "Du har opprettet for mange ønskes kjøpt-annonser den siste timen. Prøv igjen senere.";

async function assertWtbCreationAllowed(userId: string) {
  await assertUserNotRateLimited(userId, "wtb_creation", 10, 3600, WTB_CREATE_LIMIT_MESSAGE);
}

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
  postal_code: string | null;
  city: string | null;
  radius_km: number | null;
  status: "draft" | "active" | "fulfilled" | "expired" | "archived";
  created_at: string;
  updated_at: string;
  expires_at: string;
};

/** Offentlig liste: bare feltene WtbListingCard leser. Aldri `*` — da lekker
 * notify_matches, draft_expiry_notified_at m.fl. til alle. user_id trengs for
 * «din annonse» og for å starte samtale (buyer_id). */
const WTB_PUBLIC_LIST_COLUMNS =
  "id, user_id, title, subtitle, description, max_price_nok, created_at, profiles(display_name, avatar_url), categories(name_nb, slug)";

export type WtbListingWithProfile = Pick<
  WtbListing,
  "id" | "user_id" | "title" | "subtitle" | "description" | "max_price_nok" | "created_at"
> & {
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  categories: { name_nb: string; slug: string } | null;
};

/** Valgfritt område: postnummerets sentrum + radius (se migrasjon
 * 20260928120000_wtb_location_and_reverse_matching.sql). Uten radius er det
 * bare informasjon til selgerne, ikke et treffkriterium. */
const wtbLocationSchema = z.object({
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
    .nullable()
    .optional(),
  city: z.string().trim().max(100).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  radius_km: z.number().int().min(1).max(2000).nullable().optional(),
});

function locationFields(data: z.infer<typeof wtbLocationSchema>) {
  const postalCode = data.postal_code || null;
  // Koordinater og radius henger på postnummeret: uten postnummer finnes
  // ikke noe område, uansett hva klienten sendte med.
  const hasCoords = !!postalCode && data.lat != null && data.lng != null;
  return {
    postal_code: postalCode,
    city: postalCode ? data.city || null : null,
    lat: hasCoords ? data.lat! : null,
    lng: hasCoords ? data.lng! : null,
    radius_km: hasCoords ? (data.radius_km ?? null) : null,
  };
}

const wtbInputSchema = wtbLocationSchema.extend({
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
    const supabaseAdmin = await getSupabaseAdmin();
    const { userId } = context;

    const fields = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category_id: data.category_id ?? null,
      max_price_nok: data.max_price_nok ?? null,
      notify_matches: data.notify_matches ?? false,
      attributes: data.attributes ?? {},
      ...locationFields(data),
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
      if (error) {
        throw await toClientError("database", error);
      }
      return { id: row.id as string };
    }

    await assertWtbCreationAllowed(userId);

    const { data: row, error } = await supabaseAdmin
      .from("wtb_listings")
      .insert({
        user_id: userId,
        ...fields,
      })
      .select("id")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
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
    const supabaseAdmin = await getSupabaseAdmin();
    const fields = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      category_id: data.category_id ?? null,
      max_price_nok: data.max_price_nok ?? null,
      notify_matches: data.notify_matches ?? false,
      attributes: data.attributes ?? {},
      ...locationFields(data),
    };

    if (data.id) {
      // Re-editing a draft that already got the "expires in 7 days" system
      // message must reset the flag — otherwise a second dormancy period
      // (edit, then go quiet again) would delete it without a fresh warning.
      const { data: row, error } = await supabaseAdmin
        .from("wtb_listings")
        .update({ ...fields, draft_expiry_notified_at: null })
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .eq("status", "draft")
        .select("id")
        .single();
      if (error) {
        throw await toClientError("database", error);
      }
      return { id: row.id as string };
    }

    await assertWtbCreationAllowed(context.userId);

    const { data: row, error } = await supabaseAdmin
      .from("wtb_listings")
      .insert({ user_id: context.userId, status: "draft", ...fields })
      .select("id")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return { id: row.id as string };
  });

export const getLatestWtbDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("wtb_listings")
      .select(
        "id, title, description, category_id, max_price_nok, notify_matches, attributes, postal_code, city, lat, lng, radius_km, updated_at",
      )
      .eq("user_id", context.userId)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    return data;
  });

export const discardWtbDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "draft");
    if (error) {
      throw await toClientError("database", error);
    }
  });

const wtbUpdateSchema = wtbLocationSchema.extend({
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
    const supabaseAdmin = await getSupabaseAdmin();
    const { userId } = context;

    const fields = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category_id !== undefined && { category_id: data.category_id }),
      ...(data.max_price_nok !== undefined && { max_price_nok: data.max_price_nok }),
      ...(data.attributes !== undefined && { attributes: data.attributes }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.postal_code !== undefined && locationFields(data)),
    };

    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .update(fields)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) {
      throw await toClientError("database", error);
    }
  });

export const deleteWtbListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from("wtb_listings")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) {
      throw await toClientError("database", error);
    }
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
    if (error) {
      throw await toClientError("database", error);
    }
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
    const supabaseAdmin = await getSupabaseAdmin();
    const q = data.q?.trim() || undefined;

    // websearch_to_tsquery('norwegian', …) stemmer ikke sammensatte norske
    // ord ("sykkel" i "search_vector" finner ikke "Ønsker terrengsykkel"),
    // og PostgREST sin .textSearch()-builder kan ikke uttrykke den
    // OR word_similarity(...)-fallbacken F1/J4-fiksen legger til. Slå derfor
    // opp id-ene for denne siden (i riktig rekkefølge, med totalt antall
    // treff) via wtb_listings_match_page (se migrasjon
    // 20260915110000_add_wtb_compound_word_search.sql), og hent de fulle
    // radene — med profiles/categories-joinet — separat.
    const { data: page, error: pageError } = await supabaseAdmin.rpc("wtb_listings_match_page", {
      _q: q ?? undefined,
      _category_ids: data.categories?.length ? data.categories : undefined,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (pageError) {
      throw await toClientError("database", pageError);
    }
    const matches = (page ?? []) as { id: string; total_count: number }[];
    if (matches.length === 0) return { rows: [], total: 0 };

    const ids = matches.map((m) => m.id);
    const { data: rows, error } = await supabaseAdmin
      .from("wtb_listings")
      .select(WTB_PUBLIC_LIST_COLUMNS)
      .in("id", ids);
    if (error) {
      throw await toClientError("database", error);
    }
    // .in() does not preserve the id list's order, so re-sort into the order
    // wtb_listings_match_page already resolved (newest first) rather than
    // paginating/sorting a second time here.
    const byId = new Map((rows ?? []).map((row) => [row.id as string, row]));
    const orderedRows = ids.map((id) => byId.get(id)).filter((row) => row !== undefined);
    return {
      rows: orderedRows as WtbListingWithProfile[],
      total: matches[0]?.total_count ?? 0,
    };
  });

export const countWtbListings = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ q: z.string().optional(), categories: z.array(z.string()).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: count, error } = await supabaseAdmin.rpc("wtb_listings_match_count", {
      _q: data.q?.trim() || undefined,
      _category_ids: data.categories?.length ? data.categories : undefined,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return (count as number | null) ?? 0;
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
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("match-wtb-for-listing", 60, 300);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: rows, error } = await supabaseAdmin.rpc("wtb_match_count", {
      _category_id: data.category_id ?? null,
      _price_nok: data.price_nok ?? null,
      _is_free: data.is_free ?? false,
      _title: data.title,
      _description: data.description ?? null,
      _attributes: data.attributes ?? {},
    } as never);
    if (error || !rows?.[0]) return { count: 0, maxPrice: null };

    return { count: rows[0].match_count ?? 0, maxPrice: rows[0].max_price ?? null };
  });

export type WtbExistingMatch = {
  id: string;
  title: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
};

/** Omvendt retning av matchWtbListingsForListing: aktive annonser som
 * allerede oppfyller et kjøpsønske brukeren fortsatt fyller ut (eller nettopp
 * publiserte). Samme sammenligning som treffvarslene via
 * listings_matching_wtb → wtb_criteria_match_listing. Krever kategori — uten
 * den ville alle annonser matchet. */
export const matchListingsForWtb = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    wtbLocationSchema
      .pick({ lat: true, lng: true, radius_km: true })
      .extend({
        category_id: z.string().uuid(),
        max_price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
        attributes: wtbAttributesSchema.optional(),
        limit: z.number().int().min(0).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ count: number; listings: WtbExistingMatch[] }> => {
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("match-listings-for-wtb", 60, 300);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: page, error } = await supabaseAdmin.rpc("listings_matching_wtb", {
      _category_id: data.category_id,
      _max_price_nok: data.max_price_nok ?? null,
      _attributes: data.attributes ?? {},
      _lat: data.lat ?? null,
      _lng: data.lng ?? null,
      _radius_km: data.radius_km ?? null,
      _limit: data.limit ?? 5,
    } as never);
    if (error) {
      throw await toClientError("database", error);
    }
    const matches = (page ?? []) as { id: string; total_count: number }[];
    if (matches.length === 0) return { count: 0, listings: [] };

    const ids = matches.map((m) => m.id);
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("listings")
      .select("id, title, price_nok, is_free, city")
      .in("id", ids);
    if (rowsError) {
      throw await toClientError("database", rowsError);
    }
    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    return {
      count: Number(matches[0].total_count),
      listings: ids.map((id) => byId.get(id)).filter((row) => row !== undefined),
    };
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
  if (error) {
    throw await toClientError("database", error);
  }
  return (data ?? []) as WtbMatchNotification[];
}

export async function markWtbMatchNotificationRead(id: string) {
  const { error } = await supabase
    .from("wtb_match_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw await toClientError("database", error);
  }
}

export async function markAllWtbMatchNotificationsRead() {
  const { error } = await supabase
    .from("wtb_match_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) {
    throw await toClientError("database", error);
  }
}

export async function deleteWtbMatchNotification(id: string) {
  const { error } = await supabase.from("wtb_match_notifications").delete().eq("id", id);
  if (error) {
    throw await toClientError("database", error);
  }
}
