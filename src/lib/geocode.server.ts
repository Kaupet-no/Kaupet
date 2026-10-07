import { z } from "zod";
import { isValidMapCoordinate } from "@/lib/kartverket-map";
import type { PlaceSearchResult } from "@/lib/geocode";

const pointSchema = z.object({ nord: z.number(), øst: z.number() });
const namesSchema = z.object({
  navn: z.array(
    z.object({
      stedsnummer: z.number().int(),
      skrivemåte: z.string().min(1),
      representasjonspunkt: pointSchema,
      kommuner: z.array(z.object({ kommunenavn: z.string() })),
      fylker: z.array(z.object({ fylkesnavn: z.string() })),
      navneobjekttype: z.string(),
      stedstatus: z.string(),
      navnestatus: z.string(),
      skrivemåtestatus: z.string(),
    }),
  ),
});
const addressSchema = z.object({
  adresser: z.array(
    z.object({
      poststed: z.string().nullable().optional(),
      postnummer: z.string().nullable().optional(),
      kommunenavn: z.string().optional(),
      representasjonspunkt: z.object({ lat: z.number(), lon: z.number() }),
    }),
  ),
});

/** Public registry responses can be reused across users at the Cloudflare edge.
 * This is a regional cache, not a global rate limiter. Errors aren't cached.
 * Local Node development ignores the Cloudflare fetch options.
 */
async function kartverket<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>) {
  const url = new URL(path, "https://api.kartverket.no/");
  url.search = new URLSearchParams({ ...params, utkoordsys: "4258" }).toString();
  const options: RequestInit & {
    cf: { cacheEverything: boolean; cacheTtlByStatus: Record<string, number> };
  } = {
    signal: AbortSignal.timeout(5_000),
    cf: { cacheEverything: true, cacheTtlByStatus: { "200": 86400, "400-599": -1 } },
  };
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("Kunne ikke hente stedsopplysninger fra Kartverket.");
  return schema.parse(await response.json());
}

export async function lookupPostalCode(postal: string) {
  if (!/^\d{4}$/.test(postal.trim())) return null;
  const data = await kartverket(
    "adresser/v1/sok",
    { postnummer: postal.trim(), treffPerSide: "1" },
    addressSchema,
  );
  const address = data.adresser[0];
  if (!address) return null;
  const point = { lat: address.representasjonspunkt.lat, lng: address.representasjonspunkt.lon };
  if (!isValidMapCoordinate(point)) return null;
  // Approximate location: an address in the postal area, not its centroid.
  return { city: address.poststed ?? address.kommunenavn ?? "", ...point };
}

export async function searchPlaces(query: string, limit: number): Promise<PlaceSearchResult[]> {
  const normalized = query.trim().normalize("NFC");
  if (/^\d{4}$/.test(normalized)) {
    const postal = await lookupPostalCode(normalized);
    return postal
      ? [
          {
            id: `postal-${normalized}`,
            label: `${normalized} ${postal.city}`,
            lat: postal.lat,
            lng: postal.lng,
          },
        ]
      : [];
  }
  const data = await kartverket(
    "stedsnavn/v1/navn",
    { sok: normalized, treffPerSide: "30" },
    namesSchema,
  );
  const seen = new Set<number>();
  return data.navn
    .filter(
      (name) =>
        name.stedstatus === "aktiv" &&
        name.navnestatus === "hovednavn" &&
        ["godkjent og prioritert", "vedtatt"].includes(name.skrivemåtestatus),
    )
    .sort((a, b) => {
      const score = (name: typeof a) =>
        Number(name.skrivemåte.toLocaleLowerCase("nb") === normalized.toLocaleLowerCase("nb")) * 2 +
        Number(["By", "Tettsted", "Bygd"].includes(name.navneobjekttype));
      return score(b) - score(a);
    })
    .flatMap((name) => {
      const point = { lat: name.representasjonspunkt.nord, lng: name.representasjonspunkt.øst };
      if (seen.has(name.stedsnummer) || !isValidMapCoordinate(point)) return [];
      seen.add(name.stedsnummer);
      const label = [
        ...new Set([
          name.skrivemåte,
          ...name.kommuner.map((c) => c.kommunenavn),
          ...name.fylker.map((f) => f.fylkesnavn),
        ]),
      ].join(", ");
      return [{ id: String(name.stedsnummer), label, ...point }];
    })
    .slice(0, limit);
}

export async function reverseGeocodeAddress(input: { lat: number; lng: number }) {
  const data = await kartverket(
    "adresser/v1/punktsok",
    {
      lat: String(input.lat),
      lon: String(input.lng),
      radius: "1000",
      treffPerSide: "1",
    },
    addressSchema,
  );
  const address = data.adresser[0];
  // A nearby address is a suggestion, not proof of which postal area contains the point.
  return {
    city: address?.poststed ?? address?.kommunenavn ?? null,
    postal_code: address?.postnummer ?? null,
  };
}

export async function geocodeNorwayAddress(input: {
  postal_code?: string | null;
  city?: string | null;
}) {
  if (input.postal_code) {
    const postal = await lookupPostalCode(input.postal_code);
    if (postal) return { lat: postal.lat, lng: postal.lng };
  }
  if (!input.city) return null;
  const place = (await searchPlaces(input.city, 1))[0];
  return place ? { lat: place.lat, lng: place.lng } : null;
}

export async function geocodeStreetAddress(input: { address_line: string; postal_code: string }) {
  const data = await kartverket(
    "adresser/v1/sok",
    {
      sok: input.address_line.trim(),
      postnummer: input.postal_code.trim(),
      treffPerSide: "1",
    },
    addressSchema,
  );
  const address = data.adresser[0];
  if (!address) return null;
  const point = { lat: address.representasjonspunkt.lat, lng: address.representasjonspunkt.lon };
  return isValidMapCoordinate(point) ? point : null;
}
