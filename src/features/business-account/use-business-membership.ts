import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { BusinessPlan } from "@/features/business-account/plans";

export type BusinessOrganization = {
  id: string;
  organization_number: string;
  legal_name: string;
  display_name: string;
  postal_code: string | null;
  city: string | null;
  selected_plan: BusinessPlan | null;
  proff_trial_started_at: string | null;
  proff_trial_ends_at: string | null;
  proff_trial_cancelled_at: string | null;
  proff_access_until: string | null;
  website_url: string | null;
  logo_path: string | null;
  brand_palette: "forest" | "navy" | "burgundy" | "slate" | null;
  created_at: string;
  updated_at: string;
};

export type BusinessMembership = {
  organization_id: string;
  user_id: string;
  role: "superuser" | "member";
  status: "invited" | "active" | "deactivated";
  created_at: string;
  updated_at: string;
  organization: BusinessOrganization;
};

/** The single client-side membership query used by menu, account page, and console. */
export function useBusinessMembership() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-membership", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BusinessMembership | null> => {
      if (!user) return null;
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id, user_id, role, status, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return null;

      // Entitlements are synchronized on reads; no background job is needed for trial expiry.
      const { error: syncError } = await supabase.rpc("sync_organization_entitlements", {
        _organization_id: membership.organization_id,
      });
      if (syncError) throw syncError;

      const { data: currentMembership, error: currentMembershipError } = await supabase
        .from("organization_members")
        .select("organization_id, user_id, role, status, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (currentMembershipError) throw currentMembershipError;
      if (!currentMembership) return null;

      const { data: organization, error: organizationError } = await supabase
        .from("organizations")
        .select(
          "id, organization_number, legal_name, display_name, postal_code, city, selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_trial_cancelled_at, proff_access_until, website_url, logo_path, brand_palette, created_at, updated_at",
        )
        .eq("id", currentMembership.organization_id)
        .maybeSingle();
      if (organizationError) throw organizationError;
      if (!organization) return null;

      return {
        ...currentMembership,
        role: currentMembership.role as BusinessMembership["role"],
        status: currentMembership.status as BusinessMembership["status"],
        organization: organization as BusinessOrganization,
      };
    },
  });
}

export function isActiveBusinessSuperuser(membership: BusinessMembership | null | undefined) {
  return membership?.role === "superuser" && membership.status === "active";
}
