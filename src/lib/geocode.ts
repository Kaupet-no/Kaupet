/**
 * Best-effort geocoding for norske adresser via Nominatim (OpenStreetMap).
 * Returnerer null hvis ingenting kunne finnes, eller hvis et nettverkskall feiler.
 * Blokker aldri en publisering på dette — koordinater kan settes senere.
 */
export async function geocodeNorwayAddress(input: {
  postal_code?: string | null;
  city?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const postal = (input.postal_code ?? "").trim();
  const city = (input.city ?? "").trim();
  if (!postal && !city) return null;

  const queries: string[] = [];
  if (postal && city) queries.push(`${postal} ${city}, Norge`);
  if (city) queries.push(`${city}, Norge`);
  if (postal) queries.push(`${postal}, Norge`);

  for (const q of queries) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("countrycodes", "no");
      url.searchParams.set("limit", "1");
      url.searchParams.set("addressdetails", "0");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "nb" },
      });
      if (!res.ok) continue;
      const data: Array<{ lat: string; lon: string }> = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng };
        }
      }
    } catch {
      // Prøv neste variant
    }
  }
  return null;
}

/**
 * Reverse-geocode et punkt til et lesbart stedsnavn i Norge (best-effort).
 * Returnerer f.eks. "Fjellhamar, Lørenskog" eller null hvis ingenting funnet.
 */
export async function reverseGeocode(input: {
  lat: number;
  lng: number;
}): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(input.lat));
    url.searchParams.set("lon", String(input.lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "12");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "nb" },
    });
    if (!res.ok) return null;
    const data: {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        municipality?: string;
        county?: string;
        country_code?: string;
      };
    } = await res.json();
    const a = data.address ?? {};
    if (a.country_code && a.country_code !== "no") return null;
    const primary = a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality;
    const secondary = a.municipality && a.municipality !== primary ? a.municipality : a.county;
    if (primary && secondary && primary !== secondary) return `${primary}, ${secondary}`;
    if (primary) return primary;
    if (secondary) return secondary;
    return null;
  } catch {
    return null;
  }
}

/**
 * Slå opp et norsk postnummer → city + koordinater.
 */
export async function lookupPostalCode(postal: string): Promise<{
  city: string;
  lat: number;
  lng: number;
} | null> {
  const p = postal.trim();
  if (!/^\d{4}$/.test(p)) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", p);
    url.searchParams.set("country", "Norway");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), { headers: { "Accept-Language": "nb" } });
    if (!res.ok) return null;
    const data: Array<{
      lat: string;
      lon: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        suburb?: string;
      };
    }> = await res.json();
    if (data.length === 0) return null;
    const a = data[0].address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? "";
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { city, lat, lng };
  } catch {
    return null;
  }
}

/**
 * Slå opp et norsk stedsnavn → postnummer + koordinater (best-effort).
 */
export async function lookupCity(city: string): Promise<{
  postal_code: string;
  lat: number;
  lng: number;
} | null> {
  const c = city.trim();
  if (c.length < 2) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("city", c);
    url.searchParams.set("country", "Norway");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), { headers: { "Accept-Language": "nb" } });
    if (!res.ok) return null;
    const data: Array<{
      lat: string;
      lon: string;
      address?: { postcode?: string };
    }> = await res.json();
    if (data.length === 0) return null;
    const postal_code = (data[0].address?.postcode ?? "").trim();
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { postal_code, lat, lng };
  } catch {
    return null;
  }
}
