import {
  geocodeNorwayAddressFn,
  geocodeStreetAddressFn,
  lookupPostalCodeFn,
  reverseGeocodeAddressFn,
  searchPlacesFn,
} from "@/lib/geocode.functions";

export type PlaceSearchResult = { id: string; label: string; lat: number; lng: number };

/** Explicit search; failures reach the search UI so they're not shown as empty results. */
export function searchPlaces(query: string, limit = 6): Promise<PlaceSearchResult[]> {
  return searchPlacesFn({ data: { query, limit } });
}

/** Best-effort helpers: location lookup must never block publication. */
export async function geocodeNorwayAddress(input: {
  postal_code?: string | null;
  city?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  if (!input.postal_code?.trim() && !input.city?.trim()) return null;
  try {
    return await geocodeNorwayAddressFn({
      data: { postal_code: input.postal_code?.trim() || null, city: input.city?.trim() || null },
    });
  } catch {
    return null;
  }
}

export async function reverseGeocode(input: { lat: number; lng: number }): Promise<string | null> {
  return (await reverseGeocodeAddress(input)).city;
}

export async function reverseGeocodeAddress(input: {
  lat: number;
  lng: number;
}): Promise<{ city: string | null; postal_code: string | null }> {
  try {
    return await reverseGeocodeAddressFn({ data: input });
  } catch {
    return { city: null, postal_code: null };
  }
}

export async function lookupPostalCode(
  postal: string,
): Promise<{ city: string; lat: number; lng: number } | null> {
  if (!/^\d{4}$/.test(postal.trim())) return null;
  try {
    return await lookupPostalCodeFn({ data: { postal } });
  } catch {
    return null;
  }
}

export async function geocodeStreetAddress(input: {
  address_line: string;
  postal_code: string;
}): Promise<{ lat: number; lng: number } | null> {
  try {
    return await geocodeStreetAddressFn({ data: input });
  } catch {
    return null;
  }
}
