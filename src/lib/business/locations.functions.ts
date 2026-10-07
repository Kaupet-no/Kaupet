import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  UNAUTHORIZED_MESSAGE,
  hasEffectiveProffAccess,
  requireOrganizationMember,
  requireSuperuserOrganization,
} from "@/lib/business/organization-access";
import {
  chatAccessSchema,
  listingAccessSchema,
  listingEditScopeSchema,
  uuid,
} from "@/lib/business/schemas";
import { normalizePhone } from "@/lib/phone";
import { ClientError, toClientError } from "@/lib/to-client-error";

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
    if (error) {
      throw await toClientError("database", error);
    }
    return { location };
  });

export const updateOrganizationLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => locationInputSchema.extend({ locationId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { geocodeStreetAddress } = await import("@/lib/geocode.server");
    const visiting = await geocodeStreetAddress({
      address_line: data.addressLine,
      postal_code: data.postalCode,
    }).catch(() => null);
    const { data: location, error } = await supabaseAdmin
      .from("organization_locations")
      .update({
        name: data.name,
        address_line: data.addressLine,
        postal_code: data.postalCode,
        city: data.city,
        visiting_lat: visiting?.lat ?? null,
        visiting_lng: visiting?.lng ?? null,
      })
      .eq("id", data.locationId)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, name, address_line, postal_code, city, lat, lng, is_default, active",
      )
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return { location };
  });

const locationContactsSchema = z.object({
  locationId: uuid,
  showVisitingAddress: z.boolean(),
  contacts: z
    .array(
      z.object({
        id: uuid.optional(),
        name: z.string().trim().min(1).max(120),
        phone: z.string().transform((value, ctx) => {
          const phone = normalizePhone(value);
          if (!phone) {
            ctx.addIssue({ code: "custom", message: "Ugyldig telefonnummer." });
            return z.NEVER;
          }
          return phone;
        }),
        showInListings: z.boolean(),
        avatarPath: z.string().max(500).nullable(),
      }),
    )
    .max(20),
});

/** Erstatter lokasjonens kontaktliste og visningsvalg for besøksadresse.
 * Profilbilder kan bare endres med aktiv Proff; uten Proff beholdes lagrede
 * bilder urørt (de vises ikke, se `listing_business_contact`). */
export const updateLocationContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => locationContactsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const { data: location, error: locationError } = await supabaseAdmin
      .from("organization_locations")
      .select("id, address_line, postal_code, visiting_lat")
      .eq("id", data.locationId)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .maybeSingle();
    if (locationError) throw await toClientError("database", locationError);
    if (!location) throw new Error(UNAUTHORIZED_MESSAGE);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("organization_location_contacts")
      .select("id, avatar_path")
      .eq("location_id", data.locationId);
    if (existingError) throw await toClientError("database", existingError);
    const existingById = new Map((existing ?? []).map((row) => [row.id, row]));
    const canUseAvatars = await hasEffectiveProffAccess(supabaseAdmin, organizationId);
    const avatarPrefix = `${organizationId}/contact-`;

    const rows = data.contacts.map((contact, index) => {
      const previous = contact.id ? existingById.get(contact.id) : undefined;
      let avatarPath = previous?.avatar_path ?? null;
      if (canUseAvatars && contact.avatarPath !== avatarPath) {
        if (contact.avatarPath && !contact.avatarPath.startsWith(avatarPrefix)) {
          throw new ClientError("Ugyldig profilbilde.", 400);
        }
        avatarPath = contact.avatarPath;
      }
      return {
        id: previous ? previous.id : crypto.randomUUID(),
        location_id: data.locationId,
        organization_id: organizationId,
        name: contact.name,
        phone: contact.phone,
        show_in_listings: contact.showInListings,
        avatar_path: avatarPath,
        sort_order: index,
      };
    });
    const keptIds = new Set(rows.map((row) => row.id));
    const removedIds = [...existingById.keys()].filter((id) => !keptIds.has(id));
    if (removedIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("organization_location_contacts")
        .delete()
        .in("id", removedIds);
      if (error) throw await toClientError("database", error);
    }
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("organization_location_contacts").upsert(rows);
      if (error) throw await toClientError("database", error);
    }

    let visiting: { lat: number; lng: number } | null = null;
    if (
      data.showVisitingAddress &&
      location.visiting_lat == null &&
      location.address_line &&
      location.postal_code
    ) {
      const { geocodeStreetAddress } = await import("@/lib/geocode.server");
      visiting = await geocodeStreetAddress({
        address_line: location.address_line,
        postal_code: location.postal_code,
      }).catch(() => null);
    }
    const { error: updateError } = await supabaseAdmin
      .from("organization_locations")
      .update({
        show_visiting_address: data.showVisitingAddress,
        ...(visiting && { visiting_lat: visiting.lat, visiting_lng: visiting.lng }),
      })
      .eq("id", data.locationId);
    if (updateError) throw await toClientError("database", updateError);
    return { ok: true as const };
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
    if (error) {
      throw await toClientError("database", error);
    }
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
    if (error) {
      throw await toClientError("database", error);
    }
    return {
      userId: data.userId,
      locationId: data.locationId,
      organizationId: membership.organizationId,
    };
  });
