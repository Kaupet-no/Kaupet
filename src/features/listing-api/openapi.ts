/**
 * Håndskrevet OpenAPI 3.1-dokument for `/api/v1/…`, servert uten auth på
 * `GET /api/v1/openapi.json` (se `src/routes/api/v1/openapi[.]json.ts`).
 * Tallgrensene hentes fra `INTEGRATION_LIMITS` i stedet for å hardkodes, slik
 * at dokumentet aldri kan avvike fra det som faktisk håndheves (samme
 * konfig som UI-ens «Grenser og forbruk», se integration-limits.ts).
 *
 * Ingen `*.server.ts`-imports her med vilje: filen inneholder ingen
 * hemmeligheter eller databaselogikk, og kan derfor importeres statisk fra
 * rutefilen uten å utløse `scripts/check-server-boundary.mjs`.
 */
import { INTEGRATION_LIMITS } from "@/lib/integration-limits";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", description: "Stabil, engelsk feilkode." },
        message: { type: "string", description: "Norsk, kundevendt feilmelding." },
        field: {
          type: "string",
          description: "Kun for validation_error: hvilket felt som feilet.",
        },
      },
    },
  },
} as const;

const listingBodySchema = {
  type: "object",
  required: ["category", "title", "description", "price"],
  properties: {
    category: { type: "string", description: "Kategoriens navn eller slug (se GET /categories)." },
    title: { type: "string", minLength: 5, maxLength: 120 },
    description: { type: "string", minLength: 20, maxLength: 4000 },
    price: {
      type: "integer",
      minimum: 0,
      maximum: 10_000_000,
      description: "Pris i hele kroner (NOK).",
    },
    subtitle: { type: "string", maxLength: 80 },
    condition: { type: "string", enum: ["new", "like_new", "good", "acceptable", "for_parts"] },
    canShip: { type: "boolean" },
    knownIssues: { type: "string", maxLength: 2000 },
    noKnownIssues: { type: "boolean" },
    maintenanceHistory: { type: "string", maxLength: 2000 },
    attributes: {
      type: "object",
      additionalProperties: true,
      description: "Kategorifelt (attr:<key>), se GET /categories/{id}/fields.",
    },
    status: {
      type: "string",
      enum: ["active", "sold", "archived"],
      description: "Utelatt/tom = ingen statusendring (en ny annonse blir aktiv).",
    },
    images: {
      type: "array",
      items: { type: "string", format: "uri" },
      maxItems: 20,
      description: "Bilde-URL-er (https://), erstatter hele settet ved synk.",
    },
    locationId: {
      type: "string",
      format: "uuid",
      description: "Lokasjon i organisasjonen. Utelatt = nøkkelens standardlokasjon.",
    },
  },
} as const;

const syncResultSchema = {
  type: "object",
  properties: {
    rowNumber: { type: "integer" },
    externalRef: { type: "string" },
    status: { type: "string", enum: ["created", "updated", "unchanged", "duplicate", "failed"] },
    listingId: { type: "string", format: "uuid" },
    kaupetCode: { type: "string" },
    error: { type: "string" },
    warning: { type: "string" },
  },
} as const;

const rateLimitHeaders = {
  "X-RateLimit-Limit": { schema: { type: "integer" }, description: "Grensen for denne kalltypen." },
  "X-RateLimit-Remaining": {
    schema: { type: "integer" },
    description: "Gjenværende kall i inneværende vindu.",
  },
  "X-RateLimit-Reset": {
    schema: { type: "integer" },
    description: "Unix-tidsstempel for tilbakestilling.",
  },
} as const;

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorSchema } },
  };
}

function withRateLimitHeaders<T extends Record<string, unknown>>(response: T) {
  return { ...response, headers: rateLimitHeaders };
}

/** Bygger OpenAPI-dokumentet på nytt hvert kall — det er billig (ingen
 * databaseoppslag) og garanterer at det aldri er stale mot `INTEGRATION_LIMITS`. */
export function buildOpenApiDocument() {
  const commonErrorResponses = {
    "401": errorResponse("Mangler, ugyldig, utløpt eller tilbakekalt API-nøkkel."),
    "403": errorResponse("Nøkkelen mangler nødvendig scope, eller aktøren mangler tilgang."),
    "429": withRateLimitHeaders(
      errorResponse("Rategrensen er nådd. Se Retry-After og X-RateLimit-*."),
    ),
    "500": errorResponse("Intern feil. Prøv igjen senere."),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Kaupet Proff API",
      version: "1.0.0",
      description:
        "REST-API for Proff-kunder til å opprette, oppdatere og lese annonser maskinelt. " +
        "Se docs/PROFF-API.md for en innføring med curl-eksempler.",
    },
    servers: [{ url: "https://kaupet.no/api/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API-nøkkel opprettet i Integrasjoner-panelet, sendt som `Authorization: Bearer kpt_live_…`.",
        },
      },
      schemas: {
        Error: errorSchema,
        ListingBody: listingBodySchema,
        SyncResult: syncResultSchema,
        ImageStatus: {
          type: "object",
          properties: {
            sourceUrl: { type: "string" },
            status: { type: "string", enum: ["pending", "processing", "done", "failed"] },
            url: { type: ["string", "null"], description: "Satt når status er done." },
            error: { type: "string", description: "Kun satt når status er failed." },
          },
        },
        Listing: {
          type: "object",
          properties: {
            externalRef: { type: "string" },
            kaupetCode: { type: "string" },
            status: { type: "string" },
            title: { type: "string" },
            priceNok: { type: ["integer", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            publicUrl: { type: "string", format: "uri" },
          },
        },
        ListingDetail: {
          allOf: [
            { $ref: "#/components/schemas/Listing" },
            {
              type: "object",
              properties: {
                images: { type: "array", items: { $ref: "#/components/schemas/ImageStatus" } },
              },
            },
          ],
        },
      },
    },
    "x-rate-limits": {
      readPerHour: INTEGRATION_LIMITS.apiKey.readPerHour,
      writePerHour: INTEGRATION_LIMITS.apiKey.writePerHour,
      batchPerHour: INTEGRATION_LIMITS.apiKey.batchPerHour,
      maxBatchRows: INTEGRATION_LIMITS.maxBatchRows,
      listingRenewalDays: INTEGRATION_LIMITS.listingRenewalDays,
      newListingsPerDayPerOrganization: INTEGRATION_LIMITS.organization.newListingsPerDay,
      newImagesPerDayPerOrganization: INTEGRATION_LIMITS.organization.newImagesPerDay,
    },
    paths: {
      "/categories": {
        get: {
          summary: "List kategorier",
          operationId: "listCategories",
          security: [],
          responses: {
            "200": withRateLimitHeaders({
              description: "Alle kategorier.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", format: "uuid" },
                            slug: { type: "string" },
                            name: { type: "string" },
                            parentId: { type: ["string", "null"], format: "uuid" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
            "401": commonErrorResponses["401"],
            "429": commonErrorResponses["429"],
          },
        },
      },
      "/categories/{id}/fields": {
        get: {
          summary: "Felt og krav for en kategori (samme som «Kategorifelter»-arket i Excel-malen)",
          operationId: "getCategoryFields",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": withRateLimitHeaders({
              description: "Feltene kategorien bruker.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: {
                              type: "string",
                              description: "attr:<key> i attributes-objektet.",
                            },
                            label: { type: "string" },
                            type: {
                              type: "string",
                              enum: [
                                "select",
                                "multiselect",
                                "number",
                                "boolean",
                                "text",
                                "brand_select",
                                "model_select",
                              ],
                            },
                            required: { type: "boolean" },
                            unit: { type: ["string", "null"] },
                            allowedValues: {
                              type: ["array", "null"],
                              items: {
                                type: "object",
                                properties: {
                                  value: { type: "string" },
                                  label: { type: "string" },
                                },
                              },
                            },
                            dependsOn: {
                              type: ["object", "null"],
                              properties: {
                                key: { type: "string" },
                                value: { type: "string" },
                                notValue: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
            "401": commonErrorResponses["401"],
            "404": errorResponse("Fant ikke kategorien."),
            "429": commonErrorResponses["429"],
          },
        },
      },
      "/locations": {
        get: {
          summary: "List organisasjonens lokasjoner",
          operationId: "listLocations",
          responses: {
            "200": withRateLimitHeaders({
              description: "Lokasjoner den utøvende brukeren har tilgang til.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            addressLine: { type: ["string", "null"] },
                            postalCode: { type: ["string", "null"] },
                            city: { type: ["string", "null"] },
                            isDefault: {
                              type: "boolean",
                              description: "Nøkkelens standardlokasjon.",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
            ...commonErrorResponses,
          },
        },
      },
      "/listings": {
        get: {
          summary: "List organisasjonens maskinelt opprettede annonser",
          operationId: "listListings",
          description:
            "Kun annonser med en ekstern referanse (opprettet via Excel/API/MCP) — annonser opprettet i " +
            "veiviseren av ansatte er ikke med her.",
          parameters: [
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["draft", "active", "sold", "archived", "expired", "disabled"],
              },
            },
            { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": withRateLimitHeaders({
              description: "Én side med annonser.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: { $ref: "#/components/schemas/Listing" } },
                      nextCursor: { type: ["string", "null"] },
                    },
                  },
                },
              },
            }),
            ...commonErrorResponses,
          },
        },
      },
      "/listings/batch": {
        post: {
          summary: "Opprett/oppdater flere annonser i ett kall",
          operationId: "batchUpsertListings",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rows"],
                  properties: {
                    mode: { type: "string", enum: ["upsert", "create"], default: "upsert" },
                    dryRun: { type: "boolean", default: false },
                    locationId: { type: "string", format: "uuid" },
                    rows: {
                      type: "array",
                      maxItems: INTEGRATION_LIMITS.maxBatchRows,
                      items: {
                        allOf: [
                          {
                            type: "object",
                            required: ["externalRef"],
                            properties: { externalRef: { type: "string" } },
                          },
                          { $ref: "#/components/schemas/ListingBody" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": withRateLimitHeaders({
              description: "Ett resultat per rad, i samme rekkefølge som sendt inn.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      importId: { type: "string", format: "uuid" },
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SyncResult" },
                      },
                    },
                  },
                },
              },
            }),
            "422": errorResponse("For mange rader, eller ugyldig forespørsel."),
            ...commonErrorResponses,
          },
        },
      },
      "/listings/renew": {
        post: {
          summary: "Forny expires_at for annonser som fortsatt er aktive",
          operationId: "renewListings",
          description:
            `Fornyer hver annonse med ${INTEGRATION_LIMITS.listingRenewalDays} dager. Send hele lageret ` +
            "minst hver 30. dag, eller kall dette endepunktet for referansene som fortsatt skal være aktive.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["externalRefs"],
                  properties: {
                    externalRefs: { type: "array", maxItems: 1000, items: { type: "string" } },
                    locationId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          responses: {
            "200": withRateLimitHeaders({
              description:
                "Antall fornyet/reaktivert/hoppet over, og referanser som ikke ble funnet.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      importId: { type: "string", format: "uuid" },
                      renewed: { type: "integer" },
                      reactivated: { type: "integer" },
                      skipped: { type: "integer" },
                      notFound: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            }),
            ...commonErrorResponses,
          },
        },
      },
      "/listings/{externalRef}": {
        get: {
          summary: "Hent én annonse",
          operationId: "getListing",
          parameters: [
            { name: "externalRef", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": withRateLimitHeaders({
              description: "Annonsen, inkludert bildejobbstatus.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ListingDetail" } },
              },
            }),
            "404": errorResponse("Fant ingen annonse med denne referansen."),
            ...commonErrorResponses,
          },
        },
        put: {
          summary: "Opprett eller oppdater én annonse (idempotent på externalRef)",
          operationId: "upsertListing",
          parameters: [
            { name: "externalRef", in: "path", required: true, schema: { type: "string" } },
            {
              name: "dryRun",
              in: "query",
              schema: { type: "boolean" },
              description: "true validerer uten å skrive noe.",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ListingBody" } },
            },
          },
          responses: {
            "201": withRateLimitHeaders({
              description: "Ny annonse opprettet.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SyncResult" } },
              },
            }),
            "200": withRateLimitHeaders({
              description: "Eksisterende annonse oppdatert/uendret, eller dryRun-resultat.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SyncResult" } },
              },
            }),
            "422": errorResponse(
              "Valideringsfeil (feltnavn i error.field når det gjelder ett felt).",
            ),
            ...commonErrorResponses,
          },
        },
      },
      "/listings/{externalRef}/status": {
        post: {
          summary: "Sett status på en annonse",
          operationId: "setListingStatus",
          parameters: [
            { name: "externalRef", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string", enum: ["active", "sold", "archived"] } },
                },
              },
            },
          },
          responses: {
            "200": withRateLimitHeaders({
              description: "Ny status.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      externalRef: { type: "string" },
                      listingId: { type: "string", format: "uuid" },
                      status: { type: "string" },
                      changed: { type: "boolean" },
                    },
                  },
                },
              },
            }),
            "404": errorResponse("Fant ingen annonse med denne referansen."),
            ...commonErrorResponses,
          },
        },
      },
      "/listings/{externalRef}/images": {
        put: {
          summary: "Erstatt bildesettet for en annonse (URL-liste)",
          operationId: "replaceListingImages",
          description:
            "Kun `application/json` med en URL-liste støttes i v1 — multipart-filopplasting gir 415. " +
            "Bildene komprimeres på samme måte som i veiviseren (se docs/PROFF-API.md).",
          parameters: [
            { name: "externalRef", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["urls"],
                  properties: {
                    urls: { type: "array", maxItems: 20, items: { type: "string", format: "uri" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": withRateLimitHeaders({
              description: "Jobbstatus per bilde-URL.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      externalRef: { type: "string" },
                      images: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ImageStatus" },
                      },
                    },
                  },
                },
              },
            }),
            "404": errorResponse("Fant ingen annonse med denne referansen."),
            "415": errorResponse(
              "Multipart-opplasting støttes ikke i v1 — send en JSON-body med «urls».",
            ),
            ...commonErrorResponses,
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "Dette dokumentet",
          operationId: "getOpenApiDocument",
          security: [],
          responses: { "200": { description: "OpenAPI 3.1-dokument." } },
        },
      },
    },
  };
}
