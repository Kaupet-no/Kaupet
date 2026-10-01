import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import type { Database } from "@/integrations/supabase/types";
import { ClientError, toClientError } from "@/lib/to-client-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminClient = SupabaseClient<Database>;

export const UNAUTHORIZED_MESSAGE = "Du har ikke tilgang til bedriftskontoen.";
export const PROFF_REQUIRED_MESSAGE = "Denne funksjonen krever et aktivt Proff-abonnement.";

export async function requireOrganizationMember(userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw await toClientError("database", error);
  }
  if (!membership) throw new ClientError(UNAUTHORIZED_MESSAGE, 403);
  const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
    _organization_id: membership.organization_id,
  });
  if (syncError) {
    throw await toClientError("database", syncError);
  }
  return {
    supabaseAdmin,
    organizationId: membership.organization_id as string,
    role: membership.role as "superuser" | "member",
    status: membership.status as "active",
  };
}

export async function requireSuperuserOrganization(userId: string) {
  const membership = await requireOrganizationMember(userId);
  if (membership.role !== "superuser") throw new ClientError(UNAUTHORIZED_MESSAGE, 403);
  return membership;
}

export async function hasEffectiveProffAccess(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin.rpc("organization_has_proff_access", {
    _organization_id: organizationId,
  });
  if (error) {
    throw await toClientError("database", error);
  }
  return data === true;
}

export async function getOrganization(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, organization_number, legal_name, display_name, selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_trial_cancelled_at, proff_access_until, website_url, logo_path, brand_palette, listing_concept, listing_font, listing_overtitle, created_at, updated_at",
    )
    .eq("id", organizationId)
    .single();
  if (error) {
    throw await toClientError("database", error);
  }
  return data;
}
