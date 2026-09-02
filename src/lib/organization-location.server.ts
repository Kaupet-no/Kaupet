import type { SupabaseClient } from "@supabase/supabase-js";

import { lookupPostalCode } from "@/lib/geocode";

export type OrganizationListingLocation = {
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Lokasjonen alle annonser fra en bedrift skal bruke.
 *
 * Bedriftsbrukere setter ikke sted per annonse — adressen kommer fra
 * `organizations`, som er forhåndsutfylt fra Brønnøysundregistrene ved
 * registrering og kan endres av en superbruker i bedriftskonsollet.
 *
 * Koordinatene slås opp fra postnummeret første gang de trengs og lagres på
 * organisasjonen, slik at en import på 500 rader gjør ett geokodingskall og
 * ikke 500. En adresseendring nullstiller dem (trigger i
 * 20260902110000_organization_address_location.sql), så neste annonse slår
 * opp på nytt. Oppslaget er best effort: feiler det, publiseres annonsen med
 * postnummer og sted, men uten koordinater.
 */
export async function organizationListingLocation(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
): Promise<OrganizationListingLocation> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("postal_code, city, lat, lng")
    .eq("id", organizationId)
    .single();
  if (error) throw error;

  const location: OrganizationListingLocation = {
    postal_code: data.postal_code ?? null,
    city: data.city ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
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
    .from("organizations")
    .update({ lat: resolved.lat, lng: resolved.lng })
    .eq("id", organizationId);
  return resolved;
}
