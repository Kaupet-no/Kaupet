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
