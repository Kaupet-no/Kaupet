import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  attributesSchema,
  getMissingRequiredFilters,
  normalizeFilter,
  vehicleCategoryGroupFor,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryNode,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  effectiveFlowForCategory,
  type CategoryFlowRow,
} from "@/features/listing-creation/category-flows";
import { validateModules } from "@/features/listing-creation/modules/validators";
import { validateRequiredFieldGroups } from "@/features/listing-creation/field-groups/validators";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_LISTINGS_PER_HOUR = 5;

async function assertUnderHourlyListingLimit(
  supabaseAdmin: SupabaseClient,
  userId: string,
  errorMessage: string,
) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= MAX_LISTINGS_PER_HOUR) {
    throw new Error(errorMessage);
  }
}

export const saveDraftListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(120),
        subtitle: z.string().trim().max(80).nullable().optional(),
        description: z.string().trim().max(4000).optional(),
        category_id: z.string().uuid().nullable().optional(),
        condition: z
          .enum(["new", "like_new", "good", "acceptable", "for_parts"])
          .nullable()
          .optional(),
        is_free: z.boolean().optional(),
        price_nok: z.number().int().min(0).max(10_000_000).nullable().optional(),
        postal_code: z
          .string()
          .regex(/^\d{4}$/)
          .nullable()
          .optional(),
        city: z.string().max(100).nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        can_ship: z.boolean().nullable().optional(),
        known_issues: z.string().trim().max(2000).nullable().optional(),
        no_known_issues: z.boolean().nullable().optional(),
        maintenance_history: z.string().trim().max(2000).nullable().optional(),
        attributes: attributesSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const fields = {
      title: data.title,
      ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category_id !== undefined && { category_id: data.category_id }),
      ...(data.condition !== undefined && { condition: data.condition }),
      ...(data.is_free !== undefined && { is_free: data.is_free }),
      ...(data.price_nok !== undefined && { price_nok: data.is_free ? null : data.price_nok }),
      ...(data.postal_code !== undefined && { postal_code: data.postal_code }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.lat !== undefined && { lat: data.lat }),
      ...(data.lng !== undefined && { lng: data.lng }),
      ...(data.can_ship !== undefined && { can_ship: data.can_ship }),
      ...(data.known_issues !== undefined && { known_issues: data.known_issues }),
      ...(data.no_known_issues !== undefined && { no_known_issues: !!data.no_known_issues }),
      ...(data.maintenance_history !== undefined && {
        maintenance_history: data.maintenance_history,
      }),
      ...(data.attributes !== undefined && { attributes: data.attributes }),
    };

    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("listings")
        .update(fields)
        .eq("id", data.id)
        .eq("seller_id", userId)
        .eq("status", "draft")
        .select("id, kaupet_code")
        .single();
      if (error) throw error;
      return { id: updated.id as string, kaupet_code: updated.kaupet_code as string };
    }

    await assertUnderHourlyListingLimit(
      supabaseAdmin,
      userId,
      "Du har opprettet for mange annonser den siste timen. Prøv igjen senere.",
    );

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({ seller_id: userId, status: "draft", ...fields })
      .select("id, kaupet_code")
      .single();
    if (error) throw error;
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        draftId: z.string().uuid().optional(),
        title: z.string().trim().min(5).max(120),
        subtitle: z.string().trim().max(80).nullable().optional(),
        description: z.string().trim().min(20).max(4000),
        category_id: z.string().uuid(),
        condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]).nullable(),
        is_free: z.boolean(),
        price_nok: z.number().int().min(0).max(10_000_000).nullable(),
        postal_code: z
          .string()
          .regex(/^\d{4}$/)
          .nullable(),
        city: z.string().max(100).nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        can_ship: z.boolean().nullable(),
        known_issues: z.string().trim().max(2000).nullable().optional(),
        no_known_issues: z.boolean().nullable().optional(),
        maintenance_history: z.string().trim().max(2000).nullable().optional(),
        attributes: attributesSchema.optional(),
        turnstileToken: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      // Bot protection must be configured in production/staging; only skip it
      // when running locally without the secret set. This fails closed rather
      // than silently letting listings through unverified in a misconfigured
      // deployed environment.
      if (process.env.NODE_ENV === "production") {
        throw new Error("Serverfeil: bot-beskyttelse er ikke konfigurert.");
      }
    } else {
      if (!data.turnstileToken) throw new Error("Turnstile-validering feilet. Prøv igjen.");
      const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: data.turnstileToken,
        }),
      });
      const cfJson = (await cfRes.json()) as { success: boolean };
      if (!cfJson.success) throw new Error("Turnstile-validering feilet. Prøv igjen.");
    }

    const [{ data: filterRows }, { data: categoryRows }, flowsResult] = await Promise.all([
      supabaseAdmin
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary"),
      supabaseAdmin.from("categories").select("id, parent_id"),
      supabaseAdmin
        .from("category_flows")
        .select("id, category_id, field_groups, modules, sort_order"),
    ]);
    const categoriesById = new Map<string, CategoryNode>(
      (categoryRows ?? []).map((c) => [c.id as string, c as CategoryNode]),
    );
    const normalizedFilters = (filterRows ?? []).map(normalizeFilter);
    const missing = getMissingRequiredFilters(
      data.category_id,
      normalizedFilters,
      categoriesById,
      data.attributes ?? {},
      VEHICLE_EQUIPMENT_FILTER_KEYS,
    );
    if (missing.length > 0) {
      throw new Error(`Fyll inn: ${missing.map((f) => f.label_nb).join(", ")}`);
    }

    // category_flows may not exist yet in every environment (pre-migration); degrade to the default flow.
    const flowRows = (flowsResult.data ?? []) as CategoryFlowRow[];
    const { fieldGroups, modules } = effectiveFlowForCategory(
      data.category_id,
      flowRows,
      categoriesById,
    );
    const moduleError = validateModules(modules, data.attributes ?? {});
    if (moduleError) throw new Error(moduleError);
    const fieldGroupError = validateRequiredFieldGroups(
      fieldGroups,
      {
        condition: data.condition,
        can_ship: data.can_ship,
      },
      getCategoryBehavior(
        vehicleCategoryGroupFor(data.category_id, normalizedFilters, categoriesById),
      ),
    );
    if (fieldGroupError) throw new Error(fieldGroupError);

    const listingFields = {
      title: data.title,
      subtitle: data.subtitle || null,
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
      known_issues: data.known_issues ?? null,
      no_known_issues: !!data.no_known_issues,
      maintenance_history: data.maintenance_history ?? null,
      ...(data.attributes !== undefined && { attributes: data.attributes }),
      status: "active" as const,
      published_at: new Date().toISOString(),
    };

    if (data.draftId) {
      const { data: listing, error } = await supabaseAdmin
        .from("listings")
        .update(listingFields)
        .eq("id", data.draftId)
        .eq("seller_id", userId)
        .eq("status", "draft")
        .select("id, kaupet_code")
        .single();
      if (error) throw error;
      return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
    }

    await assertUnderHourlyListingLimit(
      supabaseAdmin,
      userId,
      "Du har publisert for mange annonser den siste timen. Prøv igjen senere.",
    );

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({ seller_id: userId, ...listingFields })
      .select("id, kaupet_code")
      .single();

    if (error) throw error;
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const republishListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
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
  .validator((input: unknown) => z.object({ listing_id: z.string().uuid() }).parse(input))
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
