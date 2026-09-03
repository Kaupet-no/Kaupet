import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidOrganizationNumber, normalizeOrganizationNumber } from "@/lib/organization-number";
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;

// Server-only modules must stay dynamically imported because this module is also
// imported by browser components through createServerFn.

const DUPLICATE_ORGANIZATION_MESSAGE = "Denne bedriften er allerede registrert på Kaupet.";
const SUPPORT_MESSAGE = "Du kan også kontakte support på kontakt@kaupet.no.";
const UNAUTHORIZED_MESSAGE = "Du har ikke tilgang til bedriftskontoen.";
const PROFF_REQUIRED_MESSAGE = "Denne funksjonen krever et aktivt Proff-abonnement.";
const USED_TRIAL_MESSAGE =
  "Prøveperioden er brukt. Bestill Proff for å fortsette med de betalte funksjonene.";
const INVITE_EXISTING_MESSAGE =
  "E-postadressen er allerede i bruk. Invitasjon av eksisterende kontoer støttes ikke ennå.";

// L-11: this used to include a masked contact email (an***@ka***.no) in the
// response. Combined with the organization number, that's often enough to
// guess the full address — and the endpoint requires no login. Refer to
// support instead; they can share contact info after an identity check.
function duplicateOrganizationMessage(): string {
  return `${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`;
}

const uuid = z.string().uuid();
const planSchema = z.enum(["proff_basis", "proff"]);
const memberRoleSchema = z.enum(["superuser", "member"]);
const listingAccessSchema = z.enum(["own", "all"]);
const chatAccessSchema = z.enum(["own", "all"]);
const listingEditScopeSchema = z.enum(["none", "own", "all"]);
const categoryAccessSchema = z.enum(["all", "restricted"]);

export type OrganizationPermissions = {
  role: "superuser" | "member";
  canCreateListings: boolean;
  categoryAccess: "all" | "restricted";
  allowedCategoryIds: string[];
};

export type OrganizationLocationPermissions = {
  role: "member" | "manager";
  listingAccess: "own" | "all";
  listingEditScope: "none" | "own" | "all";
  chatAccess: "own" | "all";
};

/** Temporary wire-compatible shape while callers migrate to location scope. */
export type OrganizationMemberPermissions = OrganizationPermissions & {
  listingAccess: "own" | "all";
  chatAccess: "own" | "all";
  listingEditScope: "none" | "own" | "all";
};

const memberPermissionsSchema = z
  .object({
    role: memberRoleSchema.default("member"),
    listingAccess: listingAccessSchema.default("own"),
    chatAccess: chatAccessSchema.default("own"),
    canCreateListings: z.boolean().default(true),
    listingEditScope: listingEditScopeSchema.default("own"),
    categoryAccess: categoryAccessSchema.default("all"),
    allowedCategoryIds: z.array(uuid).default([]),
  })
  .superRefine((value, context) => {
    if (
      value.role === "member" &&
      value.canCreateListings &&
      value.categoryAccess === "restricted" &&
      value.allowedCategoryIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedCategoryIds"],
        message: "Velg minst én kategori.",
      });
    }
  });
function normalizeMemberPermissions(
  value: OrganizationMemberPermissions,
): OrganizationMemberPermissions {
  if (value.role === "superuser") {
    return {
      role: "superuser",
      listingAccess: "all",
      chatAccess: "all",
      canCreateListings: true,
      listingEditScope: "all",
      categoryAccess: "all",
      allowedCategoryIds: [],
    };
  }
  return {
    ...value,
    listingAccess: value.listingEditScope === "all" ? "all" : value.listingAccess,
    categoryAccess: value.canCreateListings ? value.categoryAccess : "all",
    allowedCategoryIds: value.categoryAccess === "restricted" ? value.allowedCategoryIds : [],
  };
}

function assertOrganizationNumber(value: string): string {
  const normalized = normalizeOrganizationNumber(value);
  if (!isValidOrganizationNumber(normalized)) {
    throw new Error("Skriv inn et gyldig organisasjonsnummer.");
  }
  return normalized;
}

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireOrganizationMember(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw new Error(UNAUTHORIZED_MESSAGE);
  const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
    _organization_id: membership.organization_id,
  });
  if (syncError) throw syncError;
  return {
    supabaseAdmin,
    organizationId: membership.organization_id as string,
    role: membership.role as "superuser" | "member",
    status: membership.status as "active",
  };
}

async function requireSuperuserOrganization(userId: string) {
  const membership = await requireOrganizationMember(userId);
  if (membership.role !== "superuser") throw new Error(UNAUTHORIZED_MESSAGE);
  return membership;
}

async function hasEffectiveProffAccess(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin.rpc("organization_has_proff_access", {
    _organization_id: organizationId,
  });
  if (error) throw error;
  return data === true;
}

export type BusinessAddress = {
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
};

export type BusinessOrganizationLookup = {
  signupToken: string;
  organizationNumber: string;
  legalName: string;
  visitingAddress: BusinessAddress;
  billingAddress: BusinessAddress;
  postalCode: string | null;
  city: string | null;
  expiresAt: string;
};

export const lookupBusinessOrganization = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        organizationNumber: z.string().trim().min(1),
        turnstileToken: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BusinessOrganizationLookup> => {
    const organizationNumber = assertOrganizationNumber(data.organizationNumber);
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("lookup-business-organization", 20, 600);
    const supabaseAdmin = await getAdmin();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("organization_number", organizationNumber)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      throw new Error(duplicateOrganizationMessage());
    }
    await supabaseAdmin
      .from("business_signup_intents")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const { fetchOrganizationFromBrreg } = await import("@/lib/brreg.server");
    const organization = await fetchOrganizationFromBrreg(organizationNumber);

    const { data: intent, error: intentError } = await supabaseAdmin
      .from("business_signup_intents")
      .insert({
        organization_number: organization.organizationNumber,
        legal_name: organization.legalName,
        visiting_address_line: organization.visitingAddress.addressLine,
        visiting_postal_code: organization.visitingAddress.postalCode,
        visiting_city: organization.visitingAddress.city,
        billing_address_line: organization.billingAddress.addressLine,
        billing_postal_code: organization.billingAddress.postalCode,
        billing_city: organization.billingAddress.city,
      })
      .select(
        "signup_token, organization_number, legal_name, visiting_address_line, visiting_postal_code, visiting_city, billing_address_line, billing_postal_code, billing_city, expires_at",
      )
      .single();
    if (intentError) {
      if (intentError.code === "23505") {
        throw new Error(`${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`);
      }
      throw intentError;
    }

    return {
      signupToken: intent.signup_token as string,
      organizationNumber: intent.organization_number as string,
      legalName: intent.legal_name as string,
      visitingAddress: {
        addressLine: (intent.visiting_address_line as string | null) ?? null,
        postalCode: (intent.visiting_postal_code as string | null) ?? null,
        city: (intent.visiting_city as string | null) ?? null,
      },
      billingAddress: {
        addressLine: (intent.billing_address_line as string | null) ?? null,
        postalCode: (intent.billing_postal_code as string | null) ?? null,
        city: (intent.billing_city as string | null) ?? null,
      },
      postalCode: (intent.visiting_postal_code as string | null) ?? null,
      city: (intent.visiting_city as string | null) ?? null,
      expiresAt: intent.expires_at as string,
    };
  });

export const bindBusinessSignupEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ signupToken: uuid, email: z.string().trim().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const supabaseAdmin = await getAdmin();
    const now = new Date().toISOString();
    const { data: intent, error: intentError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("signup_token, email, expires_at")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", now)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) throw new Error("Registreringen er utløpt. Start på nytt.");
    if (intent.email && intent.email !== email) {
      throw new Error("Denne registreringen er allerede knyttet til en annen e-postadresse.");
    }
    if (intent.email === email) return { email };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("business_signup_intents")
      .update({ email })
      .eq("signup_token", data.signupToken)
      .is("email", null)
      .gt("expires_at", now)
      .select("email")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated?.email === email) return { email };

    // A concurrent binder won the conditional update; only the same address may reuse it.
    const { data: rebound, error: reboundError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("email")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (reboundError) throw reboundError;
    if (rebound?.email === email) return { email };
    throw new Error("Denne registreringen er allerede knyttet til en annen e-postadresse.");
  });

async function getOrganization(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, organization_number, legal_name, display_name, selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_trial_cancelled_at, proff_access_until, website_url, logo_path, brand_palette",
    )
    .eq("id", organizationId)
    .single();
  if (error) throw error;
  return data;
}

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
      if (assignmentsError) throw assignmentsError;
      if (!assignments?.length) throw new Error(UNAUTHORIZED_MESSAGE);
      const canViewAll = assignments.some((assignment) => assignment.listing_access === "all");
      const locationIds = assignments.map((assignment) => assignment.location_id as string);
      listingQuery = listingQuery.in("organization_location_id", locationIds);
      if (!canViewAll) listingQuery = listingQuery.eq("seller_id", context.userId);
    }

    const { data: listings, error: listingsError } = await listingQuery;
    if (listingsError) throw listingsError;
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
    if (statusHistoryError) throw statusHistoryError;
    if (salesError) throw salesError;
    if (viewEventsError) throw viewEventsError;

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
    if (membershipError) throw membershipError;
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from("organization_member_categories")
      .select("category_id")
      .eq("organization_id", organizationId)
      .eq("user_id", context.userId);
    if (categoriesError) throw categoriesError;
    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("organization_locations")
      .select(
        "id, organization_id, name, address_line, postal_code, city, lat, lng, is_default, active, created_at, updated_at, organization_location_members!organization_location_members_location_organization_fk(user_id, role, listing_access, listing_edit_scope, chat_access)",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (locationsError) throw locationsError;
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
      if (error) throw error;
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
  // Enten en forhåndsdefinert palett-ID eller en egendefinert hex-farge —
  // speiler organizations_brand_palette_check i databasen.
  brandPalette: z
    .union([z.enum(["forest", "navy", "burgundy", "slate"]), z.string().regex(/^#[0-9a-f]{6}$/u)])
    .nullable()
    .optional(),
});

export const updateBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const advancedRequested =
      data.websiteUrl !== undefined ||
      data.logoPath !== undefined ||
      data.brandPalette !== undefined;
    if (advancedRequested && !(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error(PROFF_REQUIRED_MESSAGE);
    }
    const updates = {
      ...(data.displayName !== undefined && { display_name: data.displayName }),
      ...(data.websiteUrl !== undefined && { website_url: data.websiteUrl }),
      ...(data.logoPath !== undefined && { logo_path: data.logoPath }),
      ...(data.brandPalette !== undefined && { brand_palette: data.brandPalette }),
    };
    const { error } = await supabaseAdmin
      .from("organizations")
      .update(updates)
      .eq("id", organizationId);
    if (error) throw error;
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
    if (error) throw error;
    return { billingProfile };
  });

export const setBusinessPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ plan: planSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const current = await getOrganization(supabaseAdmin, organizationId);
    const now = new Date();

    if (data.plan === "proff") {
      if (current.proff_trial_started_at) {
        const hasAccess = await hasEffectiveProffAccess(supabaseAdmin, organizationId);
        if (current.selected_plan === "proff" && hasAccess) {
          return { organization: current };
        }
        throw new Error(USED_TRIAL_MESSAGE);
      }
      const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { error } = await supabaseAdmin
        .from("organizations")
        .update({
          selected_plan: "proff",
          proff_trial_started_at: now.toISOString(),
          proff_trial_ends_at: trialEnds.toISOString(),
          proff_access_until: trialEnds.toISOString(),
          proff_trial_cancelled_at: null,
        })
        .eq("id", organizationId)
        .is("proff_trial_started_at", null);
      if (error) throw error;
    } else {
      const hasAccess =
        current.selected_plan === "proff" &&
        (await hasEffectiveProffAccess(supabaseAdmin, organizationId));
      const updates = hasAccess
        ? {
            selected_plan: "proff_basis",
            proff_trial_cancelled_at: now.toISOString(),
            proff_access_until: now.toISOString(),
          }
        : { selected_plan: "proff_basis" };
      const { error } = await supabaseAdmin
        .from("organizations")
        .update(updates)
        .eq("id", organizationId);
      if (error) throw error;
    }

    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) throw syncError;
    return { organization: await getOrganization(supabaseAdmin, organizationId) };
  });

const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(240),
  postalCode: z.string().regex(/^\d{4}$/),
  city: z.string().trim().min(1).max(100),
});

export const createOrganizationLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => locationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { data: location, error } = await supabaseAdmin.rpc("create_organization_location", {
      _organization_id: organizationId,
      _name: data.name,
      _address_line: data.addressLine,
      _postal_code: data.postalCode,
      _city: data.city,
    });
    if (error) throw error;
    return { location };
  });

export const updateOrganizationLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => locationInputSchema.extend({ locationId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { data: location, error } = await supabaseAdmin
      .from("organization_locations")
      .update({
        name: data.name,
        address_line: data.addressLine,
        postal_code: data.postalCode,
        city: data.city,
      })
      .eq("id", data.locationId)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, name, address_line, postal_code, city, lat, lng, is_default, active",
      )
      .single();
    if (error) throw error;
    return { location };
  });

const locationMemberSchema = z.object({
  locationId: uuid,
  userId: uuid,
  role: z.enum(["member", "manager"]),
  listingAccess: listingAccessSchema,
  listingEditScope: listingEditScopeSchema,
  chatAccess: chatAccessSchema,
});

export const setOrganizationLocationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => locationMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireOrganizationMember(context.userId);
    const { error } = await context.supabase.rpc("set_organization_location_member_permissions", {
      _location_id: data.locationId,
      _user_id: data.userId,
      _role: data.role,
      _listing_access: data.listingAccess,
      _listing_edit_scope: data.listingEditScope,
      _chat_access: data.chatAccess,
    });
    if (error) throw error;
    return {
      userId: data.userId,
      locationId: data.locationId,
      organizationId: membership.organizationId,
    };
  });

export const removeOrganizationLocationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ locationId: uuid, userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireOrganizationMember(context.userId);
    const { error } = await context.supabase.rpc("remove_organization_location_member", {
      _location_id: data.locationId,
      _user_id: data.userId,
    });
    if (error) throw error;
    return {
      userId: data.userId,
      locationId: data.locationId,
      organizationId: membership.organizationId,
    };
  });

async function businessInvitationRedirect(): Promise<string> {
  const configuredOrigin = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configuredOrigin) return `${configuredOrigin}/bedriftsinvitasjon`;

  try {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    const allowedHost =
      host === "kaupet.no" ||
      host === "www.kaupet.no" ||
      host === "test.kaupet.no" ||
      host.startsWith("localhost:") ||
      host.startsWith("127.0.0.1:");
    if (allowedHost) {
      const protocol =
        host.startsWith("localhost:") || host.startsWith("127.0.0.1:") ? "http" : "https";
      return `${protocol}://${host}/bedriftsinvitasjon`;
    }
  } catch {
    // Server functions can also run without a request context in jobs/tests.
  }
  return "https://kaupet.no/bedriftsinvitasjon";
}

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email(),
        permissions: memberPermissionsSchema.optional(),
        locationAssignments: z
          .array(
            z.object({
              locationId: uuid,
              role: z.enum(["member", "manager"]),
              listingAccess: listingAccessSchema,
              listingEditScope: listingEditScopeSchema,
              chatAccess: chatAccessSchema,
            }),
          )
          .min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error(PROFF_REQUIRED_MESSAGE);
    }
    const permissions = normalizeMemberPermissions(
      data.permissions ?? memberPermissionsSchema.parse({}),
    );
    const email = data.email.trim().toLowerCase();
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: data.name.trim() },
        redirectTo: await businessInvitationRedirect(),
      },
    );
    if (inviteError) {
      if (
        inviteError.status === 422 ||
        /already|registered|exists|in use/i.test(inviteError.message)
      ) {
        throw new Error(INVITE_EXISTING_MESSAGE);
      }
      throw inviteError;
    }
    const userId = invited.user?.id;
    if (!userId) throw new Error("Kunne ikke opprette invitasjonen. Prøv igjen.");

    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role: permissions.role,
      status: "invited",
      can_create_listings: permissions.canCreateListings,
      category_access: permissions.categoryAccess,
    });
    if (memberError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      if (memberError.code === "23505") throw new Error(INVITE_EXISTING_MESSAGE);
      throw memberError;
    }
    if (permissions.categoryAccess === "restricted") {
      const { error: categoryError } = await supabaseAdmin
        .from("organization_member_categories")
        .insert(
          permissions.allowedCategoryIds.map((categoryId) => ({
            organization_id: organizationId,
            user_id: userId,
            category_id: categoryId,
          })),
        );
      if (categoryError) {
        await supabaseAdmin.from("organization_members").delete().match({
          organization_id: organizationId,
          user_id: userId,
        });
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw categoryError;
      }
    }
    let assignments = data.locationAssignments;
    if (!assignments) {
      const { data: defaultLocation, error: defaultLocationError } = await supabaseAdmin
        .from("organization_locations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .single();
      if (defaultLocationError || !defaultLocation) {
        throw defaultLocationError ?? new Error("Bedriften må ha minst én aktiv lokasjon.");
      }
      assignments = [
        {
          locationId: defaultLocation.id,
          role: "member" as const,
          listingAccess: permissions.listingAccess,
          listingEditScope: permissions.listingEditScope,
          chatAccess: permissions.chatAccess,
        },
      ];
    }
    const { error: locationsError } = await supabaseAdmin
      .from("organization_location_members")
      .insert(
        assignments.map((assignment) => ({
          location_id: assignment.locationId,
          organization_id: organizationId,
          user_id: userId,
          role: permissions.role === "superuser" ? "manager" : assignment.role,
          listing_access: permissions.role === "superuser" ? "all" : assignment.listingAccess,
          listing_edit_scope:
            permissions.role === "superuser" ? "all" : assignment.listingEditScope,
          chat_access: permissions.role === "superuser" ? "all" : assignment.chatAccess,
        })),
      );
    if (locationsError) {
      await supabaseAdmin.from("organization_members").delete().match({
        organization_id: organizationId,
        user_id: userId,
      });
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw locationsError;
    }
    return { userId, email };
  });

export const acceptOrganizationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getAdmin();
    const { data: membership, error: lookupError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", context.userId)
      .eq("status", "invited")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!membership) throw new Error("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
    const organizationId = membership.organization_id as string;
    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) throw syncError;
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error("Invitasjonen er ikke lenger tilgjengelig.");
    }
    const { data: accepted, error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "active" })
      .eq("organization_id", organizationId)
      .eq("user_id", context.userId)
      .eq("status", "invited")
      .select("organization_id")
      .single();
    if (error) throw error;
    return { organizationId: accepted.organization_id as string };
  });

export const removeOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { error } = await supabaseAdmin.rpc("remove_organization_member", {
      _organization_id: organizationId,
      _user_id: data.userId,
    });
    if (error) throw error;
    return { userId: data.userId };
  });

const ORDER_SELECT =
  "id, term, status, price_ex_vat_nok, billing_email, billing_reference, fiken_invoice_number, period_start, period_end, created_at";

export type ProffOrder = {
  id: string;
  term: ProffTerm;
  status: "pending" | "invoiced" | "paid" | "cancelled";
  price_ex_vat_nok: number;
  billing_email: string;
  billing_reference: string | null;
  fiken_invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

async function findOpenProffOrder(
  supabaseAdmin: AdminClient,
  organizationId: string,
): Promise<ProffOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("proff_orders")
    .select(ORDER_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["pending", "invoiced"])
    .maybeSingle();
  if (error) throw error;
  return (data as ProffOrder | null) ?? null;
}

export const getOpenProffOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    return { order: await findOpenProffOrder(supabaseAdmin, organizationId) };
  });

export const requestProffSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        term: z.enum(["monthly", "yearly"]),
        billingReference: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const term = PROFF_TERMS[data.term];
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("organization_billing_profiles")
      .select("billing_email, address_line, postal_code, city")
      .eq("organization_id", organizationId)
      .single();
    if (profileError) throw profileError;
    const { data: inserted, error } = await supabaseAdmin
      .from("proff_orders")
      .insert({
        organization_id: organizationId,
        requested_by: context.userId,
        term: term.id,
        price_ex_vat_nok: term.priceExVatNok,
        billing_email: profile.billing_email,
        billing_reference: data.billingReference || null,
      })
      .select(ORDER_SELECT)
      .single();
    if (error) {
      if (error.code === "23505") {
        const existing = await findOpenProffOrder(supabaseAdmin, organizationId);
        if (existing) return { order: existing, alreadyOpen: true };
      }
      throw error;
    }
    const organization = await getOrganization(supabaseAdmin, organizationId);
    await notifyProffOrder(supabaseAdmin, organization, inserted as ProffOrder);
    return { order: inserted as ProffOrder, alreadyOpen: false, billingAddress: profile };
  });

/**
 * Who follows up a new order. PROFF_ORDER_INBOX wins when set (a shared sales
 * address), otherwise every admin is notified so the alert never depends on
 * configuration that may be missing.
 */
async function proffOrderRecipients(supabaseAdmin: AdminClient): Promise<string[]> {
  const configured = process.env.PROFF_ORDER_INBOX?.trim();
  if (configured) return [configured];

  const { data: admins, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (error) throw error;

  const emails = await Promise.all(
    (admins ?? []).map(async ({ user_id }) => {
      const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      return userError ? null : (data.user?.email ?? null);
    }),
  );
  return emails.filter((email): email is string => Boolean(email));
}

/** Phase 0: the invoice is created by hand in Fiken, so a human has to be told. */
async function notifyProffOrder(
  supabaseAdmin: AdminClient,
  organization: { legal_name: string; organization_number: string; display_name: string },
  order: ProffOrder,
) {
  try {
    const to = await proffOrderRecipients(supabaseAdmin);
    if (to.length === 0) {
      console.error("No Proff order recipients configured, skipping notification");
      return;
    }
    const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
    const { sendInternalEmail } = await import("@/lib/email.server");
    await sendInternalEmail({
      to,
      subject: `Proff-bestilling: ${organization.legal_name}`,
      text: [
        `Bedrift: ${organization.legal_name} (${organization.display_name})`,
        `Org.nr: ${organization.organization_number}`,
        `Periode: ${order.term === "yearly" ? "Årlig" : "Månedlig"}`,
        `Pris: ${order.price_ex_vat_nok} kr eks. mva`,
        `Fakturaepost: ${order.billing_email}`,
        `Deres referanse: ${order.billing_reference ?? "—"}`,
        `Ordre-ID: ${order.id}`,
        "",
        "Opprett faktura i Fiken og registrer den under Admin → Proff-abonnement:",
        `${siteUrl}/admin/proff-abonnement`,
      ].join("\n"),
    });
  } catch (cause) {
    // The order is stored; a failed notification must not fail the customer's request.
    console.error("Failed to send Proff order notification", cause);
  }
}
