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
 * seter, bruktimport, sylindre/slagvolum/motorkode, girkasse) er kontrollert
 * mot et faktisk Enkeltoppslag-svar. `bruktimport` ligger under
 * `godkjenning.forstegangsGodkjenning`, og hengerfeste utledes fra positiv
 * tillatt hengervekt. Soveplasser finnes ikke i OpenAPI-skjemaet og må
 * fortsatt fylles inn manuelt for kjøretøy der feltet er påkrevd.
 *
 * NB 3: `classification_code` og `body_type_hint`/`body_type_code` er
 * kontrollert mot faktiske svar. Karosserikoden/-navnet kommer fra
 * `tekniskeData.karosseriOgLasteplan.karosseritype`; `body_type` er den
 * tilsvarende verdien i Kaupets Bil-filter og brukes til automatisk
 * utfylling av annonsen.
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

import type { VehicleLookupResult } from "./vehicle-lookup.types";

function assertVehicleLookupConfigured() {
  if (!process.env.STATENS_VEGVESEN_API_KEY) {
    throw new Error(
      "Kjøretøyoppslag er ikke konfigurert. Mangler STATENS_VEGVESEN_API_KEY. Be administrator legge inn nøkkelen.",
    );
  }
}
const SVV_BASE_URL = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

const vehicleLookupUrl =
  process.env.E2E_TEST === "1"
    ? (process.env.E2E_VEHICLE_LOOKUP_URL ?? SVV_BASE_URL)
    : SVV_BASE_URL;

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

/** Best-effort mapping of SVV's DRIVSTOFFTYPE kodeverk (kodeNavn strings) to
 * our select options:
 * https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/index-kodeverk.html?kodeverkId=DRIVSTOFFTYPE
 * Codes 7/8 in that kodeverk are the literal, distinct values "Bensin
 * hybrid"/"Diesel hybrid" — SVV already tells the two hybrid kinds apart, it
 * isn't inferred by combining a separate "Bensin"/"Elektrisk" pair, so the
 * hybrid check below matches on that combined phrase within a single
 * kodeNavn. `drivstoff` is still an array (bi-fuel vehicles can report more
 * than one entry), so every entry's kodeNavn is checked, not just the first.
 *
 * NB: the kodeverk table above lists further codes with no matching select
 * option (Parafin, Biodiesel, Biobensin, Metanol, LPG/LNG/CNG variants,
 * Komprimert luft, "Annet drivstoff"). LPG/LNG/CNG are folded into our
 * "Gass (CNG)" option since that's the closest bucket we have; Biodiesel/
 * Biobensin fold into plain Diesel/Bensin for the same reason. The rest
 * return null (left unset) rather than guess. This mapping was verified
 * against the kodeverk UI page's rendered content, not a raw API payload —
 * double-check against a real lookup response before relying on it in prod. */
function mapFuelType(values: Array<string | null | undefined> | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  const lowered = values.filter((v): v is string => !!v).map((v) => v.toLowerCase());
  if (lowered.length === 0) return null;
  const has = (s: string) => lowered.some((v) => v.includes(s));
  if (has("hybrid")) {
    // "Diesel hybrid" vs "Bensin hybrid" — a bare "Hybrid" with no fuel
    // qualifier defaults to bensin-hybrid, the far more common of the two.
    return has("diesel") ? "hybrid_diesel" : "hybrid_bensin";
  }
  if (has("hydrogen")) return "hydrogen";
  if (has("diesel")) return "diesel"; // also covers "Biodiesel"
  if (has("bensin")) return "bensin"; // also covers "Biobensin"
  if (has("elektrisk") || lowered.includes("el")) return "el";
  if (has("cng") || has("lpg") || has("lng") || has("gass")) return "gass_cng";
  if (has("etanol") || has("e85")) return "etanol_e85";
  return null;
}

/** Maps SVV's body-type descriptions to the values offered by the Bil filter. */
function mapBodyTypeOption(
  code: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const value = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (code?.toUpperCase() === "BB") return "varebil";
  if (value.includes("suv")) return "suv";
  if (value.includes("stasjonsvogn")) return "stasjonsvogn";
  if (value.includes("sedan")) return "sedan";
  if (value.includes("cabriolet")) return "cabriolet";
  if (value.includes("coup")) return "coupe";
  if (value.includes("pickup")) return "pickup";
  if (value.includes("kombi")) return "kombi";
  if (value.includes("varebil")) return "varebil";
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

/** Derives drive type from `tekniskeData.akslinger` (verified against the
 * Enkeltoppslag Swagger schema, August 2026): `antallAksler` gives the total
 * axle count, and each axle in `akselGruppe[].akselListe[]` carries its own
 * `drivAksel` flag — but the schema does NOT document that this list is
 * ordered front-to-back, so a single driven axle can't be reliably mapped to
 * "forhjul" vs. "bakhjul" from this data alone. We therefore only resolve the
 * unambiguous case (two axles, both driven → 4x4) automatically; everything
 * else (one driven axle of two, more than two axles, or missing axle data at
 * all) returns `null` so vehicle-confirm asks the seller directly instead of
 * guessing. This replaces the previous `hjuldrift.kodeNavn` string-matching
 * approach, which SVV's schema doesn't actually expose at that path. */
function driveTypeFromAxles(
  akslinger:
    | {
        antallAksler?: number;
        akselGruppe?: Array<{ akselListe?: Array<{ drivAksel?: boolean }> }>;
      }
    | null
    | undefined,
): string | null {
  if (!akslinger) return null;
  const axles = (akslinger.akselGruppe ?? []).flatMap((g) => g.akselListe ?? []);
  if (axles.length === 0) return null;
  const drivenCount = axles.filter((a) => a.drivAksel).length;
  if (akslinger.antallAksler === 2 && axles.length === 2 && drivenCount === 2) return "4x4";
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
  const url = new URL(vehicleLookupUrl);
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
        forstegangsGodkjenning?: { bruktimport?: unknown };
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
              karosseritype?: { kodeVerdi?: string; kodeNavn?: string };
            };
            vekter?: {
              egenvekt?: number;
              tillattTotalvekt?: number;
              tekniskTillattVektPahengsvogn?: number;
              tillattTilhengervektMedBrems?: number;
            };
            dimensjoner?: {
              lengde?: number;
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
            };
            akslinger?: {
              antallAksler?: number;
              akselGruppe?: Array<{ akselListe?: Array<{ drivAksel?: boolean }> }>;
            };
            persontall?: { sitteplasserTotalt?: number };
            tilhengerkopling?: { kopling?: Array<{ belastningLoddrettMaks?: number }> };
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
  const brand = nullifyPlaceholder(teknisk?.generelt?.merke?.[0]?.merke);
  const model = normalizeModelSpacing(
    stripBrandPrefix(nullifyPlaceholder(teknisk?.generelt?.handelsbetegnelse?.[0]), brand),
  );
  const firstRegDate = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato ?? null;
  const firstRegYear = firstRegDate?.slice(0, 4);
  const motor = teknisk?.motorOgDrivverk?.motor?.[0];
  const fuelType = mapFuelType(motor?.drivstoff?.map((d) => d.drivstoffKode?.kodeNavn));
  const maxTowWeight =
    teknisk?.vekter?.tillattTilhengervektMedBrems ??
    teknisk?.vekter?.tekniskTillattVektPahengsvogn ??
    null;
  const klassifisering = vehicle.godkjenning?.tekniskGodkjenning?.kjoretoyklassifisering;
  const bodyTypeCode = nullifyPlaceholder(teknisk?.karosseriOgLasteplan?.karosseritype?.kodeVerdi);
  const bodyTypeHint = nullifyPlaceholder(
    teknisk?.karosseriOgLasteplan?.karosseritype?.kodeNavn ?? klassifisering?.beskrivelse,
  );

  return {
    registrationNumber: regNr,
    brand,
    model,
    year: firstRegYear ? Number(firstRegYear) : null,
    fuel_type: fuelType,
    transmission: mapTransmission(teknisk?.motorOgDrivverk?.girkassetype?.kodeNavn),
    color: nullifyPlaceholder(teknisk?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn),
    weight_kg: teknisk?.vekter?.egenvekt ?? null,
    max_total_weight_kg: teknisk?.vekter?.tillattTotalvekt ?? null,
    // `dimensjoner.lengde` er i mm i SVV-skjemaet (samme konvensjon som andre
    // dimensjonsfelt), konvertert her til meter for å matche den eksisterende
    // `length_m`-category_filteren (tidligere kun et manuelt felt for bobil/
    // campingvogn). Ikke verifisert mot et reelt respons-payload ennå — se
    // NB 2.
    length_m: teknisk?.dimensjoner?.lengde != null ? teknisk.dimensjoner.lengde / 1000 : null,
    vin: vehicle.kjoretoyId?.understellsnummer ?? null,
    next_eu_control: vehicle.periodiskKjoretoyKontroll?.kontrollfrist ?? null,
    power_hk: (() => {
      const kw = motor?.drivstoff?.[0]?.maksNettoEffekt || motor?.drivstoff?.[0]?.maksEffektPrTime;
      return kw ? Math.round(kw * 1.35962) : null;
    })(),
    drive_type: driveTypeFromAxles(teknisk?.akslinger),
    axle_count: teknisk?.akslinger?.antallAksler ?? null,
    tow_hitch: maxTowWeight != null && maxTowWeight > 0,
    max_tow_weight_kg: maxTowWeight,
    seats: teknisk?.persontall?.sitteplasserTotalt ?? null,
    imported_used: vehicle.godkjenning?.forstegangsGodkjenning?.bruktimport != null,
    first_registration_date: firstRegDate,
    cylinders: fuelType !== "el" ? (motor?.antallSylindre ?? null) : null,
    engine_displacement_cc: fuelType !== "el" ? (motor?.slagvolum ?? null) : null,
    engine_code: fuelType !== "el" ? nullifyPlaceholder(motor?.motorKode) : null,
    // Statens vegvesens Enkeltoppslag-API har ingen felt for antall
    // soveplasser i det hele tatt (verifisert mot det reelle OpenAPI-skjemaet
    // for /v3/api-docs/Enkeltoppslag, august 2026 — "antallSoveplasser"
    // finnes ikke der; NB 2 lenger opp i filen tok feil om dette). Sannsynlig
    // årsak: soveplasser er ikke en lovregulert teknisk/avgiftsrelevant
    // opplysning slik vekt/seter/effekt er, så vognkortet/kjøretøyregisteret
    // sporer det trolig ikke. `sleeping_places` er derfor alltid `null` her —
    // selger må fylle det inn manuelt i vehicle-confirm (se EditableSpec).
    sleeping_places: null,
    classification_code: nullifyPlaceholder(klassifisering?.tekniskKode?.kodeNavn),
    avgiftsklasse_code: nullifyPlaceholder(klassifisering?.kjoretoyAvgiftsKode?.kodeVerdi),
    avgiftsklasse_name: nullifyPlaceholder(klassifisering?.kjoretoyAvgiftsKode?.kodeNavn),
    body_type_code: bodyTypeCode,
    body_type_hint: bodyTypeHint,
    body_type: mapBodyTypeOption(bodyTypeCode, bodyTypeHint),
  };
}
