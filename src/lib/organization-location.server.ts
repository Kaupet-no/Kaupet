import type { SupabaseClient } from "@supabase/supabase-js";

import { lookupPostalCode } from "@/lib/geocode";

export type OrganizationListingLocation = {
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  address_line: string | null;
};

/** Resolves and caches coordinates on the selected organization location. */
export async function organizationListingLocation(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
  locationId: string,
): Promise<OrganizationListingLocation> {
  const { data, error } = await supabaseAdmin
    .from("organization_locations")
    .select("postal_code, city, lat, lng, address_line, organization_id, active")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .single();
  if (error) throw error;

  const location: OrganizationListingLocation = {
    postal_code: data.postal_code ?? null,
    city: data.city ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    address_line: data.address_line ?? null,
  };
  if (location.lat != null && location.lng != null) return location;
  if (!location.postal_code) return location;

  const looked = await lookupPostalCode(location.postal_code);
  if (!looked) return location;
  const resolved = {
    ...location,
    city: location.city ?? (looked.city || null),
    lat: looked.lat,
    lng: looked.lng,
  };
  await supabaseAdmin
    .from("organization_locations")
    .update({ city: resolved.city, lat: resolved.lat, lng: resolved.lng })
    .eq("id", locationId)
    .eq("organization_id", organizationId);
  return resolved;
}
