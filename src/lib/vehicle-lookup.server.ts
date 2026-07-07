/**
 * Statens vegvesen kjøretøyoppslag (server-only).
 * Endepunkt, spørreparameter og grunnleggende responsfelter (merke/modell/år/
 * drivstoff/farge/vekt/VIN/EU-kontroll) er verifisert mot Swagger/OpenAPI-
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
 *
 * NB 2: Feltene lagt til i juli 2026 (effekt, hjuldrift, hengerfeste,
 * seter, bruktimport, sylindre/slagvolum/motorkode, soveplasser, girkasse)
 * er hentet fra Swagger-schemaet for `/v3/api-docs/Enkeltoppslag`, men
 * stiene er IKKE verifisert mot et reelt API-svar i denne økten. All
 * parsing under er derfor defensiv (optional chaining → null ved avvik) og
 * bør dobbeltsjekkes mot et faktisk respons-payload før det stoles blindt
 * på i produksjon.
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
  power_hk: number | null;
  drive_type: string | null;
  tow_hitch: boolean | null;
  max_tow_weight_kg: number | null;
  seats: number | null;
  imported_used: boolean | null;
  first_registration_date: string | null;
  cylinders: number | null;
  engine_displacement_cc: number | null;
  engine_code: string | null;
  sleeping_places: number | null;
};

const SVV_BASE_URL = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

/** SVV returns "-" (or blank) for fields that don't apply to a given vehicle
 * (e.g. no specific model registered for the brand) — treat that as "no
 * value" rather than a real string, so callers never try to match/propose it
 * as an actual brand or model name. */
function nullifyPlaceholder(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

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

/** Best-effort mapping of girkassetype-kodeNavn to our select options. */
function mapTransmission(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("manuell")) return "manuell";
  if (v.includes("automat")) return "automat";
  return null;
}

/** Best-effort mapping of hjuldrift-kodeNavn to our select options. */
function mapDriveType(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("fire") || v.includes("4x4") || v.includes("firehjul")) return "4x4";
  if (v.includes("bak")) return "bakhjul";
  if (v.includes("for")) return "forhjul";
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
              antallSoveplasser?: number;
            };
            vekter?: {
              egenvekt?: number;
              tekniskTillattVektPahengsvogn?: number;
              tillattTilhengervektMedBrems?: number;
            };
            motorOgDrivverk?: {
              motor?: Array<{
                drivstoff?: Array<{
                  drivstoffKode?: { kodeNavn?: string };
                  maksNettoEffekt?: number;
                }>;
                antallSylindre?: number;
                slagvolum?: number;
                motorKode?: string;
              }>;
              girkassetype?: { kodeNavn?: string };
              hjuldrift?: { kodeNavn?: string };
            };
            persontall?: { sitteplasserTotalt?: number };
            tilhengerkopling?: { kopling?: Array<{ belastningLoddrettMaks?: number }> };
          };
        };
      };
      forstegangsregistrering?: { registrertForstegangNorgeDato?: string };
      forstegangsGodkjenning?: { bruktimport?: unknown };
      periodiskKjoretoyKontroll?: { kontrollfrist?: string };
      kjoretoyId?: { understellsnummer?: string; kjennemerke?: string };
    }>;
  };

  const vehicle = json.kjoretoydataListe?.[0];
  if (!vehicle) {
    throw new Error(json.feilmelding || `Fant ikke kjøretøy med registreringsnummer ${regNr}.`);
  }

  const teknisk = vehicle.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const brand = nullifyPlaceholder(teknisk?.generelt?.merke?.[0]?.merke);
  const model = nullifyPlaceholder(teknisk?.generelt?.handelsbetegnelse?.[0]);
  const firstRegDate = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato ?? null;
  const firstRegYear = firstRegDate?.slice(0, 4);
  const motor = teknisk?.motorOgDrivverk?.motor?.[0];
  const fuelType = mapFuelType(motor?.drivstoff?.[0]?.drivstoffKode?.kodeNavn);
  const tilhengerkopling = teknisk?.tilhengerkopling?.kopling?.[0];

  return {
    registrationNumber: regNr,
    brand,
    model,
    year: firstRegYear ? Number(firstRegYear) : null,
    fuel_type: fuelType,
    transmission: mapTransmission(teknisk?.motorOgDrivverk?.girkassetype?.kodeNavn),
    color: nullifyPlaceholder(teknisk?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn),
    weight_kg: teknisk?.vekter?.egenvekt ?? null,
    vin: vehicle.kjoretoyId?.understellsnummer ?? null,
    next_eu_control: vehicle.periodiskKjoretoyKontroll?.kontrollfrist ?? null,
    power_hk: motor?.drivstoff?.[0]?.maksNettoEffekt
      ? Math.round(motor.drivstoff[0].maksNettoEffekt * 1.35962)
      : null,
    drive_type: mapDriveType(teknisk?.motorOgDrivverk?.hjuldrift?.kodeNavn),
    tow_hitch: tilhengerkopling ? Boolean(tilhengerkopling.belastningLoddrettMaks) : null,
    max_tow_weight_kg:
      teknisk?.vekter?.tillattTilhengervektMedBrems ??
      teknisk?.vekter?.tekniskTillattVektPahengsvogn ??
      null,
    seats: teknisk?.persontall?.sitteplasserTotalt ?? null,
    imported_used: vehicle.forstegangsGodkjenning?.bruktimport != null ? true : null,
    first_registration_date: firstRegDate,
    cylinders: fuelType !== "el" ? (motor?.antallSylindre ?? null) : null,
    engine_displacement_cc: fuelType !== "el" ? (motor?.slagvolum ?? null) : null,
    engine_code: fuelType !== "el" ? nullifyPlaceholder(motor?.motorKode) : null,
    sleeping_places: teknisk?.karosseriOgLasteplan?.antallSoveplasser ?? null,
  };
}
