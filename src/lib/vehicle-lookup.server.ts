/**
 * Statens vegvesen kjøretøyoppslag (server-only).
 * Endepunkt, spørreparameter og responsfelter er verifisert mot Swagger/OpenAPI-
 * dokumentasjonen for Enkeltoppslag-APIet:
 * https://akfell-datautlevering.atlas.vegvesen.no/swagger-ui/index.html?configUrl=/v3/api-docs/swagger-config#/enkelt-oppslag-resource/hentKjoretoydata
 * (GET /enkeltoppslag/kjoretoydata?kjennemerke=...).
 *
 * NB: Autentiseringsmåten (header-navn/skjema) er IKKE dokumentert i selve
 * OpenAPI-spesifikasjonen (håndheves trolig av et API-gateway/portal foran
 * tjenesten, utenfor det som eksponeres i Swagger). Header-navnet under
 * («SVV-Authorization: Apikey ...») er en antagelse — bekreft det faktiske
 * autentiseringsoppsettet mot portalen/avtalen for den utleverte nøkkelen
 * før dette går i prod.
 */

function assertVehicleLookupConfigured() {
  if (!process.env.STATENS_VEGVESEN_API_KEY) {
    throw new Error(
      "Kjøretøyoppslag er ikke konfigurert. Mangler STATENS_VEGVESEN_API_KEY. Be administrator legge inn nøkkelen.",
    );
  }
}

export type VehicleLookupResult = {
  registrationNumber: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string | null;
  transmission: string | null;
  color: string | null;
  weight_kg: number | null;
  vin: string | null;
  next_eu_control: string | null;
};

const SVV_BASE_URL = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

/** Best-effort mapping of common Norwegian fuel-type strings to our select options. */
function mapFuelType(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("diesel")) return "diesel";
  if (v.includes("bensin")) return "bensin";
  if (v.includes("elektrisk") || v === "el") return "el";
  if (v.includes("hybrid")) return "hybrid";
  return null;
}

export async function lookupVehicle(registrationNumber: string): Promise<VehicleLookupResult> {
  assertVehicleLookupConfigured();
  const regNr = registrationNumber.trim().toUpperCase();

  const url = new URL(SVV_BASE_URL);
  url.searchParams.set("kjennemerke", regNr);

  const res = await fetch(url.toString(), {
    headers: {
      "SVV-Authorization": `Apikey ${process.env.STATENS_VEGVESEN_API_KEY}`,
      Accept: "application/json",
    },
  });

  // 422 = "Antall kjoretoy i respons overstiger kvote" (kvote brukt opp), med
  // Retry-After-header ("Prøv igjen etter midnatt (norsk tid)").
  if (res.status === 422) {
    throw new Error("Kvoten for kjøretøyoppslag er brukt opp for i dag. Prøv igjen etter midnatt.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kjøretøyoppslag feilet: ${res.status} ${text}`);
  }

  // Root response (KjoretoydataResponse): `feilmelding` er rot-nivå, ikke per
  // kjøretøy; "ikke funnet" gir 200 med tom/manglende kjoretoydataListe.
  const json = (await res.json()) as {
    feilmelding?: string;
    kjoretoydataListe?: Array<{
      godkjenning?: {
        tekniskGodkjenning?: {
          tekniskeData?: {
            generelt?: {
              merke?: Array<{ merke?: string }>;
              handelsbetegnelse?: string[];
            };
            karosseriOgLasteplan?: {
              rFarge?: Array<{ kodeNavn?: string }>;
            };
            vekter?: { egenvekt?: number };
            motorOgDrivverk?: {
              motor?: Array<{ drivstoff?: Array<{ drivstoffKode?: { kodeNavn?: string } }> }>;
            };
          };
        };
      };
      forstegangsregistrering?: { registrertForstegangNorgeDato?: string };
      periodiskKjoretoyKontroll?: { kontrollfrist?: string };
      kjoretoyId?: { understellsnummer?: string; kjennemerke?: string };
    }>;
  };

  const vehicle = json.kjoretoydataListe?.[0];
  if (!vehicle) {
    throw new Error(json.feilmelding || `Fant ikke kjøretøy med registreringsnummer ${regNr}.`);
  }

  const teknisk = vehicle.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const brand = teknisk?.generelt?.merke?.[0]?.merke ?? null;
  const model = teknisk?.generelt?.handelsbetegnelse?.[0] ?? null;
  const firstRegYear = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato?.slice(0, 4);

  return {
    registrationNumber: regNr,
    brand,
    model,
    year: firstRegYear ? Number(firstRegYear) : null,
    fuel_type: mapFuelType(
      teknisk?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeNavn,
    ),
    transmission: null,
    color: teknisk?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn ?? null,
    weight_kg: teknisk?.vekter?.egenvekt ?? null,
    vin: vehicle.kjoretoyId?.understellsnummer ?? null,
    next_eu_control: vehicle.periodiskKjoretoyKontroll?.kontrollfrist ?? null,
  };
}
