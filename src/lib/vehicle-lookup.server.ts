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
 *
 * NB 3: `classification_code` (EU-kjøretøyklasse, f.eks. "M1"/"N1"/"L3e"/
 * "O1") og `body_type_hint`/`body_type_code` (karosseritype) er lagt til
 * august 2026 basert på offentlig SVV-dokumentasjon om
 * `kjoretoyklassifisering`-strukturen, men stiene under er IKKE verifisert
 * mot et reelt respons-payload. Forbrukeren ser og kan overstyre utledet
 * kjøretøytype i bekreftelsessteget, så en feil her blokkerer aldri
 * annonsering — men bør valideres mot ekte oppslag før dette stoles blindt
 * på i produksjon.
 *
 * NB 4: `avgiftsklasse_code`/`avgiftsklasse_name` (feltet
 * `kjoretoyAvgiftsKode` i `kjoretoyklassifisering`, jf. kodeverket
 * "AVGIFT" — https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/
 * index-kodeverk.html?kodeverkId=AVGIFT) er den faktiske norske
 * kjøretøygruppen (f.eks. "101" Personbil, "601" Moped, "630"
 * Beltemotorsykkel) og er nå PRIMÆRKILDEN for `classifyVehicleCategory`,
 * siden den kartlegger direkte til Kaupets kjøretøykategorier — langt mer
 * pålitelig enn den generiske EU-teknisk-klassen (`classification_code`),
 * som kun brukes som fallback. `body_type_code`/`body_type_hint` (kodeverket
 * "KAROSSERITYPE") hentes fra samme sted som før
 * (`karosseriOgLasteplan.karosseritype`), nå med både kode (`kodeVerdi`,
 * f.eks. "AC") og navn (`kodeNavn`, f.eks. "Stasjonsvogn") eksponert.
 *
 * NB 5: Motoreffekt (kW) kan stå på to ulike felt på samme motor-oppføring,
 * verifisert mot to reelle respons-payloads (juli 2026): en Nissan Leaf
 * 30kWh (EK60000) hadde KUN `maksEffektPrTime` (80.0 → riktig 80 kW/109 hk),
 * mens en Hyundai IONIQ 5 N (EJ74505) hadde BEGGE — `maksNettoEffekt: 478.0`
 * (riktig, gir 650 hk — bilens reelle toppeffekt) og `maksEffektPrTime: 158.8`
 * (en lavere, antatt kontinuerlig/nominell effekt, IKKE tallet som brukes i
 * annonser/spesifikasjoner). `power_hk` leser derfor `maksNettoEffekt` først
 * og faller kun tilbake til `maksEffektPrTime` når `maksNettoEffekt` mangler
 * helt — ingen av stiene er bekreftet på et forbrenningsmotor-payload ennå.
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
  classification_code: string | null;
  avgiftsklasse_code: string | null;
  avgiftsklasse_name: string | null;
  body_type_code: string | null;
  body_type_hint: string | null;
};

/** category_filters keys that vehicle-confirm lets the user review/edit
 * directly right after a lookup — suppressed from re-appearing as editable
 * inputs in the later category-attributes ("Detaljer") step so the user
 * isn't asked to fill in the same field twice. */
export const VEHICLE_LOOKUP_FILTER_KEYS = [
  "fuel_type",
  "transmission",
  "drive_type",
  "weight_kg",
  "power_hk",
  "tow_hitch",
  "max_tow_weight_kg",
  "seats",
  "color",
  "next_eu_control",
] as const;

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

/** SVV's `handelsbetegnelse` (model) sometimes repeats the brand as a
 * prefix — e.g. brand "Nissan" with model "Nissan Leaf 30kWh" — which would
 * otherwise duplicate the brand in the assembled title ("Nissan Nissan Leaf
 * 30kWh"). Strip a leading brand-name match (whole word, case-insensitive)
 * from the model before returning it. */
function stripBrandPrefix(model: string | null, brand: string | null): string | null {
  if (!model || !brand) return model;
  const brandLower = brand.trim().toLowerCase();
  const modelLower = model.toLowerCase();
  if (modelLower === brandLower) return null;
  if (!modelLower.startsWith(brandLower)) return model;
  const rest = model.slice(brand.trim().length);
  if (rest === "" || /^[a-zæøå0-9]/i.test(rest)) return model; // not a whole-word prefix match
  return rest.trim() || null;
}

/** SVV's `handelsbetegnelse` is the manufacturer's homologated commercial
 * name, which is sometimes run together without a space — e.g. "IONIQ5"
 * instead of "IONIQ 5" (verified against a real payload, EJ74505). Insert a
 * space between a >=4-letter word and a trailing digit run. The 4-letter
 * threshold deliberately leaves short alphanumeric model codes alone (Audi
 * "A4", VW "ID4", Porsche "GT3" are correctly written without a space). */
function normalizeModelSpacing(model: string | null): string | null {
  if (!model) return model;
  return model.replace(/([A-Za-zÆØÅæøå]{4,})(\d+)/g, "$1 $2");
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

/** Next midnight in Europe/Oslo, as a Date — used to tell the user exactly
 * when the SVV daily quota resets, instead of a vague "prøv igjen senere". */
function nextNorwayMidnight(): Date {
  const now = new Date();
  const osloDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // osloDateParts is "YYYY-MM-DD" for "now" in Oslo time; midnight tonight in
  // Oslo is that date + 1 day at 00:00, expressed back as a UTC instant via a
  // round-trip through the Oslo offset at that moment.
  const [y, m, d] = osloDateParts.split("-").map(Number);
  const midnightUtcGuess = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  // Correct for Oslo's UTC offset (CET/CEST) at that instant.
  const offsetMinutes = getOsloOffsetMinutes(midnightUtcGuess);
  return new Date(midnightUtcGuess.getTime() - offsetMinutes * 60_000);
}

function getOsloOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const localMinutes = hour * 60 + minute;
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  let diff = localMinutes - utcMinutes;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

/** Formats a Date as "kl. HH:MM" in Europe/Oslo — shared by the SVV
 * quota-exhausted message here and the per-user hourly rate limit message in
 * vehicle-lookup.functions.ts. */
export function formatRetryClockNorway(at: Date): string {
  const time = new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  return `kl. ${time}`;
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
    throw new Error(
      `Kvoten for kjøretøyoppslag hos Statens vegvesen er brukt opp for i dag. Prøv igjen ${formatRetryClockNorway(nextNorwayMidnight())}, eller fyll inn kjøretøyopplysningene manuelt i mellomtiden.`,
    );
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
          kjoretoyklassifisering?: {
            tekniskKode?: { kodeNavn?: string };
            beskrivelse?: string;
            kjoretoyAvgiftsKode?: { kodeVerdi?: string; kodeNavn?: string };
          };
          tekniskeData?: {
            generelt?: {
              merke?: Array<{ merke?: string }>;
              handelsbetegnelse?: string[];
            };
            karosseriOgLasteplan?: {
              rFarge?: Array<{ kodeNavn?: string }>;
              antallSoveplasser?: number;
              karosseritype?: { kodeVerdi?: string; kodeNavn?: string };
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
                  maksEffektPrTime?: number;
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
  const model = normalizeModelSpacing(
    stripBrandPrefix(nullifyPlaceholder(teknisk?.generelt?.handelsbetegnelse?.[0]), brand),
  );
  const firstRegDate = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato ?? null;
  const firstRegYear = firstRegDate?.slice(0, 4);
  const motor = teknisk?.motorOgDrivverk?.motor?.[0];
  const fuelType = mapFuelType(motor?.drivstoff?.[0]?.drivstoffKode?.kodeNavn);
  const tilhengerkopling = teknisk?.tilhengerkopling?.kopling?.[0];
  const klassifisering = vehicle.godkjenning?.tekniskGodkjenning?.kjoretoyklassifisering;

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
    power_hk: (() => {
      const kw = motor?.drivstoff?.[0]?.maksNettoEffekt || motor?.drivstoff?.[0]?.maksEffektPrTime;
      return kw ? Math.round(kw * 1.35962) : null;
    })(),
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
    classification_code: nullifyPlaceholder(klassifisering?.tekniskKode?.kodeNavn),
    avgiftsklasse_code: nullifyPlaceholder(klassifisering?.kjoretoyAvgiftsKode?.kodeVerdi),
    avgiftsklasse_name: nullifyPlaceholder(klassifisering?.kjoretoyAvgiftsKode?.kodeNavn),
    body_type_code: nullifyPlaceholder(teknisk?.karosseriOgLasteplan?.karosseritype?.kodeVerdi),
    body_type_hint: nullifyPlaceholder(
      teknisk?.karosseriOgLasteplan?.karosseritype?.kodeNavn ?? klassifisering?.beskrivelse,
    ),
  };
}
