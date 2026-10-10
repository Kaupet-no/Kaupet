import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PROFF_REQUIRED_MESSAGE,
  hasEffectiveProffAccess,
  requireSuperuserOrganization,
} from "@/lib/business/organization-access";
import {
  chatAccessSchema,
  listingAccessSchema,
  listingEditScopeSchema,
  memberPermissionsSchema,
  normalizeMemberPermissions,
  uuid,
} from "@/lib/business/schemas";
import { ClientError, toClientError } from "@/lib/to-client-error";

// Server-only modules must stay dynamically imported because this module is also
// imported by browser components through createServerFn.

const INVITE_EXISTING_MESSAGE =
  "E-postadressen er allerede i bruk. Invitasjon av eksisterende kontoer støttes ikke ennå.";

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
      host === "staging.kaupet.no" ||
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
    const { assertUserNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertUserNotRateLimited(context.userId, "business_invite", 5, 3600);
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
      throw await toClientError("inviteOrganizationMember", inviteError);
    }
    const userId = invited.user?.id;
    if (!userId) throw new Error("Kunne ikke opprette invitasjonen. Prøv igjen.");
    // Auth does not prove whether this call created the account; never delete it on membership errors.

    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role: permissions.role,
      status: "invited",
      can_create_listings: permissions.canCreateListings,
      category_access: permissions.categoryAccess,
    });
    if (memberError) {
      if (memberError.code === "23505") {
        const { data: existing, error: lookupError } = await supabaseAdmin
          .from("organization_members")
          .select("status")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (lookupError) throw await toClientError("inviteOrganizationMember.lookup", lookupError);
        // Auth has already re-sent the email; the existing permissions are kept unchanged.
        if (existing?.status === "invited") return { userId, email, alreadyInvited: true };
        throw new ClientError(INVITE_EXISTING_MESSAGE, 409);
      }
      throw await toClientError("inviteOrganizationMember", memberError);
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
          status: "invited",
        });
        throw await toClientError("inviteOrganizationMember", categoryError);
      }
    }
    const { error: locationsError } = await supabaseAdmin
      .from("organization_location_members")
      .insert(
        data.locationAssignments.map((assignment) => ({
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
        status: "invited",
      });
      throw await toClientError("inviteOrganizationMember", locationsError);
    }
    return { userId, email, alreadyInvited: false };
  });

export const resendOrganizationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new ClientError(PROFF_REQUIRED_MESSAGE, 403);
    }
    const { data: member, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", data.userId)
      .eq("status", "invited")
      .maybeSingle();
    if (memberError) throw await toClientError("resendOrganizationInvite.lookup", memberError);
    if (!member) throw new ClientError("Invitasjonen finnes ikke eller er allerede godtatt.", 409);
    const { assertUserNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertUserNotRateLimited(context.userId, "business_invite", 5, 3600);
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (targetError) throw await toClientError("resendOrganizationInvite.user", targetError);
    if (!target.user?.email) throw new ClientError("Invitasjonen har ingen gyldig mottaker.", 409);
    const redirectTo = await businessInvitationRedirect();
    // Opening the invite link confirms the email before a password is chosen, and Auth refuses
    // to re-invite confirmed users. A recovery link lands on the same page to set it and accept.
    const { error } = target.user.email_confirmed_at
      ? await supabaseAdmin.auth.resetPasswordForEmail(target.user.email, { redirectTo })
      : await supabaseAdmin.auth.admin.inviteUserByEmail(target.user.email, { redirectTo });
    if (error) throw await toClientError("resendOrganizationInvite.send", error);
    return { userId: data.userId };
  });

export const acceptOrganizationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: membership, error: lookupError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", context.userId)
      .eq("status", "invited")
      .maybeSingle();
    if (lookupError) {
      throw await toClientError("database", lookupError);
    }
    if (!membership)
      throw new ClientError("Invitasjonen er ugyldig, utløpt eller allerede brukt.", 409);
    const organizationId = membership.organization_id as string;
    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) {
      throw await toClientError("database", syncError);
    }
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new ClientError("Invitasjonen er ikke lenger tilgjengelig.", 409);
    }
    const { data: accepted, error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "active" })
      .eq("organization_id", organizationId)
      .eq("user_id", context.userId)
      .eq("status", "invited")
      .select("organization_id")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
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
    if (error) {
      throw await toClientError("database", error);
    }
    return { userId: data.userId };
  });
