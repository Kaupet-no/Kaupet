import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  PROFF_REQUIRED_MESSAGE,
  UNAUTHORIZED_MESSAGE,
  getOrganization,
  hasEffectiveProffAccess,
  requireOrganizationMember,
  requireSuperuserOrganization,
} from "@/lib/business/organization-access";
import { uuid } from "@/lib/business/schemas";
import { toClientError } from "@/lib/to-client-error";

export type BusinessListingStat = {
  id: string;
  status: Database["public"]["Enums"]["listing_status"];
  viewCount: number;
  createdAt: string;
};

export type BusinessListingHistoryPoint = {
  date: string;
  active: number;
  inactive: number;
  lowViews: number;
  sold: number;
};

export type BusinessListingStats = {
  current: BusinessListingStat[];
  soldCount: number;
  history: BusinessListingHistoryPoint[];
};

const businessListingStatsInput = z.object({
  locationId: uuid.nullable(),
  threshold: z.number().int().min(0).max(1_000_000),
  soldDays: z.number().int().min(1).max(365),
});
const BUSINESS_HISTORY_DAYS = 365;
const BUSINESS_MAX_SOLD_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export const getBusinessListingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => businessListingStatsInput.parse(input))
  .handler(async ({ data, context }): Promise<BusinessListingStats> => {
    const { supabaseAdmin, organizationId, role } = await requireOrganizationMember(context.userId);
    let listingQuery = supabaseAdmin
      .from("listings")
      .select(
        "id, status, seller_id, organization_location_id, created_at, listing_view_totals(total_views)",
      )
      .eq("organization_id", organizationId);

    if (role === "superuser") {
      if (data.locationId) {
        listingQuery = listingQuery.eq("organization_location_id", data.locationId);
      }
    } else {
      let assignmentsQuery = supabaseAdmin
        .from("organization_location_members")
        .select("location_id, listing_access")
        .eq("organization_id", organizationId)
        .eq("user_id", context.userId);
      if (data.locationId) assignmentsQuery = assignmentsQuery.eq("location_id", data.locationId);
      const { data: assignments, error: assignmentsError } = await assignmentsQuery;
      if (assignmentsError) {
        throw await toClientError("database", assignmentsError);
      }
      if (!assignments?.length) throw new Error(UNAUTHORIZED_MESSAGE);
      const canViewAll = assignments.some((assignment) => assignment.listing_access === "all");
      const locationIds = assignments.map((assignment) => assignment.location_id as string);
      listingQuery = listingQuery.in("organization_location_id", locationIds);
      if (!canViewAll) listingQuery = listingQuery.eq("seller_id", context.userId);
    }

    const { data: listings, error: listingsError } = await listingQuery;
    if (listingsError) {
      throw await toClientError("database", listingsError);
    }
    const rawListings = (listings ?? []) as unknown as Array<{
      id: string;
      status: Database["public"]["Enums"]["listing_status"];
      created_at: string;
      listing_view_totals: { total_views: number } | { total_views: number }[] | null;
    }>;
    const listingIds = rawListings.map((listing) => listing.id);
    const historyStart = new Date(Date.now() - (BUSINESS_HISTORY_DAYS - 1) * DAY_MS);
    const salesStart = new Date(Date.now() - BUSINESS_MAX_SOLD_DAYS * DAY_MS);
    const [
      { data: statusHistory, error: statusHistoryError },
      { data: sales, error: salesError },
      { data: viewEvents, error: viewEventsError },
    ] = listingIds.length
      ? await Promise.all([
          supabaseAdmin
            .from("listing_status_history")
            .select("listing_id, status, changed_at")
            .in("listing_id", listingIds)
            .order("changed_at"),
          supabaseAdmin
            .from("listing_sales")
            .select("listing_id, confirmed_at")
            .in("listing_id", listingIds)
            .gte("confirmed_at", salesStart.toISOString()),
          supabaseAdmin
            .from("listing_view_events")
            .select("listing_id, created_at")
            .in("listing_id", listingIds)
            .gte("created_at", historyStart.toISOString()),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (statusHistoryError) {
      throw await toClientError("database", statusHistoryError);
    }
    if (salesError) {
      throw await toClientError("database", salesError);
    }
    if (viewEventsError) {
      throw await toClientError("database", viewEventsError);
    }

    const current = rawListings.map((listing) => {
      const totals = Array.isArray(listing.listing_view_totals)
        ? listing.listing_view_totals[0]
        : listing.listing_view_totals;
      return {
        id: listing.id,
        status: listing.status,
        viewCount: Number(totals?.total_views ?? 0),
        createdAt: listing.created_at,
      };
    });
    const statusByListing = new Map<
      string,
      Array<{ status: Database["public"]["Enums"]["listing_status"]; changed_at: string }>
    >();
    for (const row of statusHistory ?? []) {
      const rows = statusByListing.get(row.listing_id) ?? [];
      rows.push({ status: row.status, changed_at: row.changed_at });
      statusByListing.set(row.listing_id, rows);
    }
    const eventsByListing = new Map<string, Map<string, number>>();
    for (const event of viewEvents ?? []) {
      const events = eventsByListing.get(event.listing_id) ?? new Map<string, number>();
      const key = dayKey(event.created_at);
      events.set(key, (events.get(key) ?? 0) + 1);
      eventsByListing.set(event.listing_id, events);
    }
    const soldByDay = new Map<string, number>();
    for (const sale of sales ?? []) {
      const key = dayKey(sale.confirmed_at);
      soldByDay.set(key, (soldByDay.get(key) ?? 0) + 1);
    }
    const soldSince = new Date(Date.now() - data.soldDays * DAY_MS);
    const soldCount = (sales ?? []).filter(
      (sale) => new Date(sale.confirmed_at).getTime() >= soldSince.getTime(),
    ).length;
    const history: BusinessListingHistoryPoint[] = [];

    for (let offset = 0; offset < BUSINESS_HISTORY_DAYS; offset += 1) {
      const date = new Date(historyStart.getTime() + offset * DAY_MS);
      const dateValue = dayKey(date);
      let active = 0;
      let inactive = 0;
      let lowViews = 0;

      for (const listing of current) {
        if (new Date(listing.createdAt).getTime() > date.getTime()) continue;
        const transitions = statusByListing.get(listing.id) ?? [
          { status: listing.status, changed_at: listing.createdAt },
        ];
        let status: Database["public"]["Enums"]["listing_status"] | null = null;
        for (const transition of transitions) {
          if (new Date(transition.changed_at).getTime() > date.getTime()) break;
          status = transition.status;
        }
        if (!status) continue;
        if (status === "active") active += 1;
        else inactive += 1;

        const events = eventsByListing.get(listing.id);
        const knownEvents = events
          ? [...events.values()].reduce((total, count) => total + count, 0)
          : 0;
        let views = Math.max(listing.viewCount - knownEvents, 0);
        if (events) {
          for (const [eventDate, count] of events) {
            if (eventDate <= dateValue) views += count;
          }
        }
        if (views < data.threshold) lowViews += 1;
      }

      history.push({
        date: dateValue,
        active,
        inactive,
        lowViews,
        sold: soldByDay.get(dateValue) ?? 0,
      });
    }

    return { current, soldCount, history };
  });

export const getBusinessOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, organizationId, role, status } = await requireOrganizationMember(
      context.userId,
    );
    const organization = await getOrganization(supabaseAdmin, organizationId);
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select(
        "organization_id, user_id, role, status, can_create_listings, category_access, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("user_id", context.userId)
      .single();
    if (membershipError) {
      throw await toClientError("database", membershipError);
    }
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from("organization_member_categories")
      .select("category_id")
      .eq("organization_id", organizationId)
      .eq("user_id", context.userId);
    if (categoriesError) {
      throw await toClientError("database", categoriesError);
    }
    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("organization_locations")
      .select(
        "id, organization_id, name, address_line, postal_code, city, lat, lng, is_default, active, show_visiting_address, created_at, updated_at, organization_location_members!organization_location_members_location_organization_fk(user_id, role, listing_access, listing_edit_scope, chat_access), organization_location_contacts(id, name, phone, avatar_path, show_in_listings, sort_order)",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (locationsError) {
      throw await toClientError("database", locationsError);
    }
    const allowedCategoryIds = (categories ?? []).map((row) => row.category_id as string);
    const normalizedLocations = (locations ?? [])
      .map((location) => {
        const assignment = (
          Array.isArray(location.organization_location_members)
            ? location.organization_location_members
            : []
        ).find((member) => member.user_id === context.userId);
        return {
          id: location.id as string,
          organization_id: location.organization_id as string,
          name: location.name as string,
          address_line: location.address_line as string | null,
          postal_code: location.postal_code as string | null,
          city: location.city as string | null,
          lat: location.lat as number | null,
          lng: location.lng as number | null,
          is_default: location.is_default as boolean,
          active: location.active as boolean,
          show_visiting_address: location.show_visiting_address as boolean,
          contacts: [...(location.organization_location_contacts ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((contact) => ({
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              avatar_path: contact.avatar_path,
              show_in_listings: contact.show_in_listings,
            })),
          created_at: location.created_at as string,
          updated_at: location.updated_at as string,
          permissions:
            role === "superuser"
              ? {
                  role: "manager" as const,
                  listingAccess: "all" as const,
                  listingEditScope: "all" as const,
                  chatAccess: "all" as const,
                }
              : assignment
                ? {
                    role: assignment.role as "member" | "manager",
                    listingAccess: assignment.listing_access as "own" | "all",
                    listingEditScope: assignment.listing_edit_scope as "none" | "own" | "all",
                    chatAccess: assignment.chat_access as "own" | "all",
                  }
                : null,
        };
      })
      .filter((location) => location.permissions !== null);
    let billingProfile = null;
    if (role === "superuser") {
      const { data, error } = await supabaseAdmin
        .from("organization_billing_profiles")
        .select(
          "organization_id, billing_email, address_line, postal_code, city, registry_refreshed_at",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        throw await toClientError("database", error);
      }
      billingProfile = data;
    }
    return {
      organization,
      membership: {
        ...membership,
        role,
        status,
        category_access: membership.category_access as "all" | "restricted",
        can_create_listings: membership.can_create_listings as boolean,
        allowed_category_ids: allowedCategoryIds,
      },
      locations: normalizedLocations,
      billingProfile,
    };
  });

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  websiteUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), "Nettsiden må bruke https://")
    .nullable()
    .optional(),
  logoPath: z.string().trim().max(500).nullable().optional(),
  brandPalette: z
    .union([z.enum(["forest", "navy", "burgundy", "slate"]), z.string().regex(/^#[0-9a-f]{6}$/u)])
    .nullable()
    .optional(),
  listingConcept: z.enum(["signatur", "redaksjonell", "butikk"]).optional(),
  listingFont: z.enum(["newsreader", "inter", "dm_sans", "source_serif_4"]).optional(),
  listingOvertitle: z.enum(["annonse_fra", "presentert_av", "bedriftsannonse"]).optional(),
});

export const updateBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const advancedRequested =
      data.websiteUrl !== undefined ||
      data.logoPath !== undefined ||
      data.brandPalette !== undefined ||
      data.listingConcept !== undefined ||
      data.listingFont !== undefined ||
      data.listingOvertitle !== undefined;
    if (advancedRequested && !(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error(PROFF_REQUIRED_MESSAGE);
    }
    const updates = {
      ...(data.displayName !== undefined && { display_name: data.displayName }),
      ...(data.websiteUrl !== undefined && { website_url: data.websiteUrl }),
      ...(data.logoPath !== undefined && { logo_path: data.logoPath }),
      ...(data.brandPalette !== undefined && { brand_palette: data.brandPalette }),
      ...(data.listingConcept !== undefined && { listing_concept: data.listingConcept }),
      ...(data.listingFont !== undefined && { listing_font: data.listingFont }),
      ...(data.listingOvertitle !== undefined && { listing_overtitle: data.listingOvertitle }),
    };
    const { error } = await supabaseAdmin
      .from("organizations")
      .update(updates)
      .eq("id", organizationId);
    if (error) {
      throw await toClientError("database", error);
    }
    return { organization: await getOrganization(supabaseAdmin, organizationId) };
  });

const billingEmailSchema = z.object({
  billingEmail: z.string().trim().toLowerCase().email().max(320),
});

export const updateOrganizationBillingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => billingEmailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { data: billingProfile, error } = await supabaseAdmin
      .from("organization_billing_profiles")
      .update({ billing_email: data.billingEmail })
      .eq("organization_id", organizationId)
      .select(
        "organization_id, billing_email, address_line, postal_code, city, registry_refreshed_at",
      )
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return { billingProfile };
  });
