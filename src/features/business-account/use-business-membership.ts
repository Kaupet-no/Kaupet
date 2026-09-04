import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getBusinessOrganization } from "@/lib/business.functions";
import { useAuth } from "@/hooks/use-auth";
import type { BusinessPlan } from "@/features/business-account/plans";

export type BusinessLocationPermissions = {
  role: "member" | "manager";
  listingAccess: "own" | "all";
  listingEditScope: "none" | "own" | "all";
  chatAccess: "own" | "all";
};

export type BusinessLocation = {
  id: string;
  organization_id: string;
  name: string;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  permissions: BusinessLocationPermissions;
};

export type BusinessOrganization = {
  id: string;
  organization_number: string;
  legal_name: string;
  display_name: string;
  selected_plan: BusinessPlan | null;
  proff_trial_started_at: string | null;
  proff_trial_ends_at: string | null;
  proff_trial_cancelled_at: string | null;
  proff_access_until: string | null;
  website_url: string | null;
  logo_path: string | null;
  /** Palett-ID (se BRAND_PALETTES) eller egendefinert «#rrggbb». */
  brand_palette: string | null;
  /** Profilering på alle bedriftens offentlige annonser. */
  listing_concept: "signatur" | "redaksjonell" | "butikk";
  listing_font: "newsreader" | "inter";
  listing_overtitle: "annonse_fra" | "presentert_av" | "bedriftsannonse";
  created_at: string;
  updated_at: string;
};

export type BusinessMembership = {
  organization_id: string;
  user_id: string;
  role: "superuser" | "member";
  status: "invited" | "active" | "deactivated";
  can_create_listings: boolean;
  category_access: "all" | "restricted";
  allowed_category_ids: string[];
  created_at: string;
  updated_at: string;
  organization: BusinessOrganization;
  locations: BusinessLocation[];
  billingProfile: {
    organization_id: string;
    billing_email: string;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
    registry_refreshed_at: string | null;
  } | null;
};

type BusinessOrganizationResponse = Awaited<
  ReturnType<ReturnType<typeof useServerFn<typeof getBusinessOrganization>>>
>;

/** The single client-side membership query used by menu, account page, and console. */
export function useBusinessMembership() {
  const { user } = useAuth();
  const loadBusinessOrganization = useServerFn(getBusinessOrganization);

  return useQuery({
    queryKey: ["business-membership", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<BusinessMembership | null> => {
      if (!user) return null;
      const response = (await loadBusinessOrganization()) as BusinessOrganizationResponse;
      if (!response?.membership || response.membership.status !== "active") return null;
      return {
        ...response.membership,
        organization: response.organization as BusinessOrganization,
        locations: response.locations as BusinessLocation[],
        billingProfile: response.billingProfile,
      } as BusinessMembership;
    },
  });
}

export function isActiveBusinessMember(membership: BusinessMembership | null | undefined) {
  return membership?.status === "active";
}

export function isActiveBusinessSuperuser(membership: BusinessMembership | null | undefined) {
  return membership?.role === "superuser" && membership.status === "active";
}
