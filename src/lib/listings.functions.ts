import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  attributesSchema,
  effectiveFiltersForCategory,
  getMissingRequiredFilters,
  normalizeFilter,
  isBoatCategory,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
  vehicleCategoryGroupFor,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryNode,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  effectiveFlowForCategory,
  type CategoryFlowRow,
} from "@/features/listing-creation/category-flows";
import { validateRequiredFieldGroups } from "@/features/listing-creation/field-groups/validators";
import { organizationListingLocation } from "@/lib/organization-location.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_LISTINGS_PER_HOUR = 5;

type ListingOwnership = {
  seller_id: string;
  organization_id: string | null;
};

type ListingMutationRow = {
  id: string;
  seller_id: string;
  organization_id: string | null;
  status: string;
  is_free: boolean;
  price_nok: number | null;
  category_id: string | null;
};

async function resolveListingOwnership(
  supabaseAdmin: SupabaseClient,
  userId: string,
  categoryId: string | null,
): Promise<ListingOwnership> {
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select(
      "organization_id, role, status, can_create_listings, listing_edit_scope, category_access",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!membership) return { seller_id: userId, organization_id: null };
  if (membership.role === "member") {
    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: membership.organization_id,
    });
    if (syncError) throw syncError;
    const { data: hasAccess, error: accessError } = await supabaseAdmin.rpc(
      "organization_has_proff_access",
      { _organization_id: membership.organization_id },
    );
    if (accessError) throw accessError;
    if (!hasAccess) throw new Error("Proff-tilgang er ikke aktiv.");
    if (!membership.can_create_listings) {
      throw new Error("Du har ikke tilgang til å opprette annonser.");
    }
    if (membership.category_access === "restricted") {
      if (!categoryId) throw new Error("Du har ikke tilgang til denne kategorien.");
      const { data: allowed, error: categoryError } = await supabaseAdmin
        .from("organization_member_categories")
        .select("category_id")
        .eq("organization_id", membership.organization_id)
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .maybeSingle();
      if (categoryError) throw categoryError;
      if (!allowed) throw new Error("Du har ikke tilgang til denne kategorien.");
    }
  }
  return { seller_id: userId, organization_id: membership.organization_id };
}

/**
 * Bedriftsannonser bruker alltid bedriftsadressen som lokasjon. Overstyringen
 * ligger her, der eierskapet allerede avgjøres, slik at hver vei inn —
 * kladd, publisering og Proff-import — treffer samme regel. Klienten kan
 * sende hva som helst i `postal_code`/`city`; det forkastes for annonser som
 * eies av en organisasjon.
 */
async function organizationLocationOverride(
  supabaseAdmin: SupabaseClient,
  organizationId: string | null,
): Promise<{
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
} | null> {
  if (!organizationId) return null;
  return organizationListingLocation(supabaseAdmin, organizationId);
}

async function authorizeListingMutation(
  supabaseAdmin: SupabaseClient,
  userId: string,
  listingId: string,
): Promise<ListingMutationRow> {
  const { data: listing, error } = await supabaseAdmin
    .from("listings")
    .select("id, seller_id, organization_id, status, is_free, price_nok, category_id")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw error;
  if (!listing) throw new Error("Annonsen finnes ikke.");
  if (listing.seller_id === userId && !listing.organization_id) return listing;
  if (!listing.organization_id) throw new Error("Du har ikke tilgang til denne annonsen");

  const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
    _organization_id: listing.organization_id,
  });
  if (syncError) throw syncError;
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("role, status, listing_edit_scope")
    .eq("organization_id", listing.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership || membership.status !== "active") {
    throw new Error("Du har ikke tilgang til denne annonsen");
  }
  if (membership.role === "member") {
    const { data: hasAccess, error: accessError } = await supabaseAdmin.rpc(
      "organization_has_proff_access",
      { _organization_id: listing.organization_id },
    );
    if (accessError) throw accessError;
    if (!hasAccess) throw new Error("Proff-tilgang er ikke aktiv.");
    if (
      membership.listing_edit_scope === "none" ||
      (membership.listing_edit_scope === "own" && listing.seller_id !== userId)
    ) {
      throw new Error("Du har ikke tilgang til denne annonsen");
    }
  }
  return listing;
}

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

function validatePartFitment(
  categoryId: string,
  filters: ReturnType<typeof normalizeFilter>[],
  categoriesById: Map<string, CategoryNode>,
  attributes: Record<string, string | number | boolean | string[]>,
) {
  const isPartCategory = effectiveFiltersForCategory(categoryId, filters, categoriesById).some(
    (filter) => filter.key === PART_FITMENT_SCOPE_KEY,
  );
  if (!isPartCategory) return;

  const scope = attributes[PART_FITMENT_SCOPE_KEY];
  if (scope !== "universal" && scope !== "specific" && scope !== "unknown") {
    throw new Error("Velg hvordan delen passer til kjøretøy.");
  }
  if (scope !== "specific") return;

  const vehicleIds = attributes[PART_FITMENT_VEHICLE_IDS_KEY];
  if (
    !Array.isArray(vehicleIds) ||
    vehicleIds.length === 0 ||
    vehicleIds.some((id) => !/^[0-9a-f-]{36}$/iu.test(id))
  ) {
    throw new Error("Legg til minst én gyldig bilmodell.");
  }

  const yearFrom = attributes[PART_FITMENT_YEAR_FROM_KEY];
  const yearTo = attributes[PART_FITMENT_YEAR_TO_KEY];
  if (typeof yearFrom === "number" && typeof yearTo === "number" && yearFrom > yearTo) {
    throw new Error("Årsmodell fra kan ikke være høyere enn årsmodell til.");
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
      const existing = await authorizeListingMutation(supabaseAdmin, userId, data.id);
      const orgLocation = await organizationLocationOverride(
        supabaseAdmin,
        existing.organization_id,
      );
      // Re-editing a draft that already got the "expires in 7 days" system
      // message must reset the flag — otherwise a second dormancy period
      // (edit, then go quiet again) would delete it without a fresh warning.
      const { data: updated, error } = await supabaseAdmin
        .from("listings")
        .update({ ...fields, ...orgLocation, draft_expiry_notified_at: null })
        .eq("id", data.id)
        .eq("status", "draft")
        .select("id, kaupet_code")
        .single();
      if (error) throw error;
      return { id: updated.id as string, kaupet_code: updated.kaupet_code as string };
    }

    const ownership = await resolveListingOwnership(supabaseAdmin, userId, null);
    const orgLocation = await organizationLocationOverride(
      supabaseAdmin,
      ownership.organization_id,
    );
    await assertUnderHourlyListingLimit(
      supabaseAdmin,
      userId,
      "Du har opprettet for mange annonser den siste timen. Prøv igjen senere.",
    );

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({
        ...(ownership.organization_id ? ownership : { seller_id: userId }),
        status: "draft",
        ...fields,
        ...orgLocation,
      })
      .select("id, kaupet_code")
      .single();
    if (error) throw error;
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const discardDraftListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await authorizeListingMutation(supabaseAdmin, context.userId, data.id);
    const { error } = await supabaseAdmin
      .from("listings")
      .delete()
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw error;
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
      .superRefine((data, ctx) => {
        if (!data.is_free && data.price_nok == null) {
          ctx.addIssue({
            code: "custom",
            path: ["price_nok"],
            message: "Oppgi en pris før annonsen publiseres.",
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);

    const [{ data: filterRows }, { data: categoryRows }, flowsResult] = await Promise.all([
      supabaseAdmin
        .from("category_filters")
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional",
        ),
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
    validatePartFitment(data.category_id, normalizedFilters, categoriesById, data.attributes ?? {});

    // category_flows may not exist yet in every environment (pre-migration); degrade to the default flow.
    const flowRows = (flowsResult.data ?? []) as CategoryFlowRow[];
    const { fieldGroups } = effectiveFlowForCategory(data.category_id, flowRows, categoriesById);
    const fieldGroupError = validateRequiredFieldGroups(
      fieldGroups,
      {
        condition: data.condition,
        can_ship: data.can_ship,
      },
      getCategoryBehavior(
        vehicleCategoryGroupFor(data.category_id, normalizedFilters, categoriesById),
        isBoatCategory(data.category_id, normalizedFilters, categoriesById),
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
      const existing = await authorizeListingMutation(supabaseAdmin, userId, data.draftId);
      const orgLocation = await organizationLocationOverride(
        supabaseAdmin,
        existing.organization_id,
      );
      const { data: listing, error } = await supabaseAdmin
        .from("listings")
        .update({ ...listingFields, ...orgLocation })
        .eq("id", data.draftId)
        .eq("status", "draft")
        .select("id, kaupet_code")
        .single();
      if (error) throw error;
      return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
    }

    const ownership = await resolveListingOwnership(supabaseAdmin, userId, data.category_id);
    const orgLocation = await organizationLocationOverride(
      supabaseAdmin,
      ownership.organization_id,
    );
    await assertUnderHourlyListingLimit(
      supabaseAdmin,
      userId,
      "Du har publisert for mange annonser den siste timen. Prøv igjen senere.",
    );

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({
        ...(ownership.organization_id ? ownership : { seller_id: userId }),
        ...listingFields,
        ...orgLocation,
      })
      .select("id, kaupet_code")
      .single();
    if (error) throw error;
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const republishListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const listing = await authorizeListingMutation(supabaseAdmin, userId, data.id);

    if (listing.status === "disabled") {
      throw new Error("Denne annonsen er deaktivert av moderator og kan ikke reaktiveres");
    }
    if (!listing.is_free && listing.price_nok == null) {
      throw new Error("Oppgi en pris før annonsen publiseres på nytt");
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error } = await supabaseAdmin
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
