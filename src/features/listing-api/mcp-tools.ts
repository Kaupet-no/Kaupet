/**
 * MCP-verktøyene for Proff-API-et (fase 5 — se
 * /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md). Tynne
 * innpakninger rundt `src/features/listing-api/listing-api.server.ts` — hvert
 * verktøy validerer/normaliserer argumenter, kaller ÉN funksjon der, og
 * bygger en kort norsk oppsummering + strukturert rådata. All faktisk
 * forretningslogikk (tilgang, kategorivalidering, rategrense-håndheving på
 * DB-nivå, RPC-ene) ligger fortsatt der — se filkommentaren i den modulen.
 *
 * Denne fila ligger under `src/features/`, så `scripts/check-server-boundary.mjs`
 * forbyr enhver linje som statisk importerer en `*.server`-modul herfra —
 * også fra `listing-api.server.ts` selv. `loadApi()` importerer den
 * dynamisk (samme mønster som rutefilene under `src/routes/api/v1/…` og som
 * `loadDeps()` i `listing-api.server.ts` selv bruker for sine egne
 * avhengigheter).
 *
 * `Auth` (parameteren hvert verktøy tar) utledes strukturelt fra selve
 * modulens funksjonssignaturer (`Parameters<Api["listLocationsApi"]>[0]`) i
 * stedet for et eget importert/duplisert type — TypeScript sjekker da
 * fortsatt at kalleren (`src/routes/api/mcp.ts`, som autentiserer via
 * `authenticateApiKey`) sender inn riktig form, uten at vi trenger en
 * `*.server`-typeimport (som ville trigget samme boundary-sjekk — den er en
 * enkel linje-regex, ikke en ekte typesjekk, se kommentaren i
 * `listing-api.server.ts`).
 */
import { INTEGRATION_LIMITS } from "@/lib/integration-limits";
import {
  MAX_IMPORT_IMAGES,
  MAX_IMPORT_IMAGE_URL_LENGTH,
} from "@/features/listing-bulk-import/import-schema";
import { listingBodySchema } from "@/features/listing-api/openapi";

function loadApi() {
  return import("@/features/listing-api/listing-api.server");
}

type Api = Awaited<ReturnType<typeof loadApi>>;
/** Strukturelt lik `ApiKeyAuth`/`AuthenticatedApiKey` — se filkommentaren. */
export type McpAuth = Parameters<Api["listLocationsApi"]>[0];

export type McpScope = "listings:read" | "listings:write";
export type McpRateLimitKind = "read" | "write" | "batch";

/** Samme skjelett som JSON Schema (draft 2020-12-kompatibel delmengde) —
 * løst typet med vilje: verktøyene bygger disse som literal-objekter, og vi
 * vil ikke måtte holde en fullstendig JSON Schema-type i sync her. */
export type JsonSchema = Record<string, unknown>;

export type McpToolResult = {
  /** Kort, norsk oppsummering — det brukeren/agenten primært leser. */
  text: string;
  /** Rådata fra tjenestelaget, uendret bortsett fra feltnavn (samme som
   * REST-svaret for samme operasjon) — se `outputSchema` per verktøy. */
  structured: unknown;
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  /** Hvilket scope nøkkelen må ha (samme scope som REST-endepunktet dette
   * verktøyet speiler). */
  scope: McpScope;
  /** Hvilken rategrense-bøtte kallet telles mot (`api-rate-limit.server.ts`).
   * Se `validate_listing` for hvorfor den ikke alltid følger scope 1:1. */
  rateLimitKind: McpRateLimitKind;
  execute: (auth: McpAuth, args: Record<string, unknown>) => Promise<McpToolResult>;
};

// --- Delte JSON Schema-biter -------------------------------------------

const externalRefProperty: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description: "Din egen unike referanse for annonsen (SKU/varenummer/lager-ID).",
};

const imageStatusSchema: JsonSchema = {
  type: "object",
  properties: {
    sourceUrl: { type: "string" },
    status: { type: "string", enum: ["pending", "processing", "done", "failed"] },
    url: { type: ["string", "null"], description: "Satt når status er done." },
    error: { type: "string", description: "Kun satt når status er failed." },
  },
};

const listingSchema: JsonSchema = {
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
};

/** `listingBodySchema` sitt `status`-felt (kun active/sold/archived — se
 * openapi.ts) utvidet med «draft», som RPC-en `upsert_listing_from_external`
 * alltid har støttet ved OPPRETTELSE av en ny annonse (se
 * `assertSchemaValid`/`allowDraftStatus` i listing-api.server.ts). REST-ets
 * offentlige skjema (openapi.json) endres bevisst IKKE — kun MCP-verktøyene
 * tilbyr «draft» eksplisitt. */
const listingStatusPropertyWithDraft: JsonSchema = {
  type: "string",
  enum: ["draft", "active", "sold", "archived"],
  description:
    "Utelatt = ingen eksplisitt statusendring (se publish/upsert_listing for hva som skjer da). " +
    "«draft» kan kun settes ved OPPRETTELSE av en ny annonse (avvises ved oppdatering av en " +
    "eksisterende), akkurat som «sold»/«archived» kun kan settes ved oppdatering.",
};

function listingBodyPropertiesWithDraftStatus(): Record<string, JsonSchema> {
  return {
    ...listingBodySchema.properties,
    status: listingStatusPropertyWithDraft,
  };
}

const LISTING_STATUSES_FOR_LIST = [
  "draft",
  "active",
  "sold",
  "archived",
  "expired",
  "disabled",
] as const;

/** Dupliserer `MAX_RENEW_REFS` (privat konstant i listing-api.server.ts) —
 * samme grunn/mønster som `LISTING_STATUSES_FOR_LIST` over: verdien kan ikke
 * importeres fra en `*.server`-modul herfra. Hold i sync med den konstanten. */
const MAX_RENEW_REFS = 1000;

// --- Hjelpere -----------------------------------------------------------

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isApiBusinessError?: unknown }).isApiBusinessError === true &&
    (error as { status?: unknown }).status === 404
  );
}

/** Fjerner `undefined`-felt slik at de aldri overskriver eksisterende
 * verdier i `mapApiBodyToRow`/`normalizeBulkImportRow` (som tolker
 * fravær ≠ eksplisitt tom verdi for enkelte felt). */
function withoutUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function draftNote(sentStatus: string | undefined): string {
  if (sentStatus === "draft") {
    return (
      "Annonsen ligger som UTKAST (draft) og er IKKE synlig for kjøpere. " +
      'Publiser den med verktøyet «set_listing_status» ({externalRef, status: "active"}) når den er klar.'
    );
  }
  if (sentStatus === "active") {
    return "Annonsen er publisert (status active) og synlig for kjøpere.";
  }
  if (sentStatus) {
    return `Status satt til «${sentStatus}».`;
  }
  return "Statusen ble ikke endret av dette kallet.";
}

// --- Verktøy --------------------------------------------------------------

const listCategories: McpTool = {
  name: "list_categories",
  description:
    "List alle kategorier (id, slug, navn, overkategori) — brukes til å slå opp category-verdien for upsert_listing.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
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
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  scope: "listings:read",
  rateLimitKind: "read",
  async execute() {
    const api = await loadApi();
    const items = await api.listCategoriesApi();
    return { text: `Fant ${items.length} kategorier.`, structured: { items } };
  },
};

const getCategoryFields: McpTool = {
  name: "get_category_fields",
  description:
    "Felt og krav for en kategori (samme som «Kategorifelter»-arket i Excel-malen) — bruk før upsert_listing for å vite hvilke attributes en kategori krever.",
  inputSchema: {
    type: "object",
    required: ["categoryId"],
    properties: {
      categoryId: { type: "string", format: "uuid", description: "Fra list_categories." },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "attr:<key> i attributes-objektet." },
            label: { type: "string" },
            type: { type: "string" },
            required: { type: "boolean" },
            unit: { type: ["string", "null"] },
            allowedValues: { type: ["array", "null"] },
            dependsOn: { type: ["object", "null"] },
          },
        },
      },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  scope: "listings:read",
  rateLimitKind: "read",
  async execute(_auth, args) {
    const categoryId = asString(args.categoryId);
    if (!categoryId) {
      throw Object.assign(new Error("Oppgi «categoryId»."), {
        isApiBusinessError: true,
        status: 422,
        code: "validation_error",
        field: "categoryId",
      });
    }
    const api = await loadApi();
    const items = await api.getCategoryFieldsApi(categoryId);
    const requiredCount = items.filter((item) => item.required).length;
    return {
      text: `Kategorien har ${items.length} felt, hvorav ${requiredCount} obligatoriske.`,
      structured: { items },
    };
  },
};

const listLocations: McpTool = {
  name: "list_locations",
  description:
    "List organisasjonens lokasjoner (den utøvende brukeren har tilgang til) — brukes til locationId ved upsert_listing.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
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
            isDefault: { type: "boolean" },
          },
        },
      },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  scope: "listings:read",
  rateLimitKind: "read",
  async execute(auth) {
    const api = await loadApi();
    const items = await api.listLocationsApi(auth);
    return { text: `Fant ${items.length} lokasjoner.`, structured: { items } };
  },
};

const listListings: McpTool = {
  name: "list_listings",
  description:
    "Paginert liste over organisasjonens maskinelt opprettede annonser (Excel/API/MCP — ikke annonser laget i veiviseren).",
  inputSchema: {
    type: "object",
    properties: {
      cursor: { type: "string", description: "Fra forrige svars nextCursor." },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      status: { type: "string", enum: [...LISTING_STATUSES_FOR_LIST] },
      updatedSince: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      items: { type: "array", items: listingSchema },
      nextCursor: { type: ["string", "null"] },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  scope: "listings:read",
  rateLimitKind: "read",
  async execute(auth, args) {
    const searchParams = new URLSearchParams();
    if (asString(args.cursor)) searchParams.set("cursor", asString(args.cursor)!);
    if (typeof args.limit === "number") searchParams.set("limit", String(args.limit));
    if (asString(args.status)) searchParams.set("status", asString(args.status)!);
    if (asString(args.updatedSince)) searchParams.set("updatedSince", asString(args.updatedSince)!);
    const api = await loadApi();
    const page = await api.listListingsApi({ auth, searchParams });
    const more = page.nextCursor ? " Flere finnes — send «cursor» for neste side." : "";
    return { text: `Fant ${page.items.length} annonser.${more}`, structured: page };
  },
};

const getListing: McpTool = {
  name: "get_listing",
  description: "Hent én annonse på dens externalRef, inkludert bildejobbstatus.",
  inputSchema: {
    type: "object",
    required: ["externalRef"],
    properties: { externalRef: externalRefProperty },
    additionalProperties: false,
  },
  outputSchema: {
    allOf: [
      listingSchema,
      { type: "object", properties: { images: { type: "array", items: imageStatusSchema } } },
    ],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  scope: "listings:read",
  rateLimitKind: "read",
  async execute(auth, args) {
    const externalRef = asString(args.externalRef) ?? "";
    const api = await loadApi();
    const listing = await api.getListingApi({ auth, externalRef });
    return {
      text: `Annonse ${listing.externalRef}: status ${listing.status}, tittel «${listing.title}». Offentlig URL: ${listing.publicUrl}`,
      structured: listing,
    };
  },
};

/** Feltene som er felles for `validate_listing`/`upsert_listing`, minus
 * `externalRef`/`publish` (som håndteres separat per verktøy). */
function listingContentInputSchema(): {
  required: string[];
  properties: Record<string, JsonSchema>;
} {
  return {
    required: [...listingBodySchema.required],
    properties: listingBodyPropertiesWithDraftStatus(),
  };
}

const validateListing: McpTool = {
  name: "validate_listing",
  description:
    "Valider en annonse UTEN å lagre noe (samme regler som upsert_listing, dryRun). Bruk denne for å " +
    "sjekke felt/kategori/attributter før du faktisk oppretter eller oppdaterer annonsen.",
  inputSchema: {
    type: "object",
    required: ["externalRef", ...(listingContentInputSchema().required as string[])],
    properties: {
      externalRef: externalRefProperty,
      ...listingContentInputSchema().properties,
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["created", "updated", "unchanged", "duplicate"] },
      externalRef: { type: "string" },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  // Krever listings:write (speiler en skriveoperasjon — samme aktør-/
  // kategorisjekker som en ekte upsert kjøres), men telles mot LESE-grensen:
  // dryRun skriver ingenting (RPC-en returnerer før noen INSERT/UPDATE), så
  // organisasjonen skal kunne validere liberalt uten å bruke av det langt
  // strammere skrive-/batch-budsjettet sitt.
  scope: "listings:write",
  rateLimitKind: "read",
  async execute(auth, args) {
    const externalRef = asString(args.externalRef) ?? "";
    const { externalRef: _ignored, ...rest } = args;
    const api = await loadApi();
    const result = await api.upsertListingApi({
      auth,
      externalRef,
      body: withoutUndefined(rest),
      dryRun: true,
      allowDraftStatus: true,
    });
    return {
      text: `Validering OK: raden ville blitt «${result.status}» for extRef ${result.externalRef}. Ingenting er lagret (dryRun).`,
      structured: result,
    };
  },
};

const upsertListing: McpTool = {
  name: "upsert_listing",
  description:
    "Opprett eller oppdater én annonse (idempotent på externalRef). Sikkerhetsdefault: en NY annonse " +
    'opprettes som UTKAST (status "draft", ikke synlig for kjøpere) med mindre du sender publish: true. ' +
    "En eksisterende annonse beholder sin nåværende status uansett, med mindre du sender «status» eksplisitt.",
  inputSchema: {
    type: "object",
    required: ["externalRef", ...(listingContentInputSchema().required as string[])],
    properties: {
      externalRef: externalRefProperty,
      ...listingContentInputSchema().properties,
      publish: {
        type: "boolean",
        description:
          "true: en NY annonse opprettes aktiv (publisert) med det samme. Utelatt/false: en NY annonse " +
          'opprettes som utkast. Uten effekt på en EKSISTERENDE annonse (bruk "status" eller ' +
          "set_listing_status for å endre den).",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      importId: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["created", "updated", "unchanged", "duplicate"] },
      externalRef: { type: "string" },
      listingId: { type: "string", format: "uuid" },
      kaupetCode: { type: "string" },
      warning: { type: "string" },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  scope: "listings:write",
  rateLimitKind: "write",
  async execute(auth, args) {
    const externalRef = asString(args.externalRef) ?? "";
    const { externalRef: _ignored, publish, ...rest } = args;
    const explicitStatus = asString(rest.status);
    const api = await loadApi();

    let sentStatus = explicitStatus;
    if (!explicitStatus) {
      if (publish === true) {
        sentStatus = "active";
      } else {
        // Sikkerhetsdefault (plan, fase 5): finn ut om dette er en NY
        // annonse — kun da settes «draft». En eksisterende annonse skal
        // ALDRI få statusen sin endret implisitt. Ett ekstra lesekall, men
        // ingen ekstra rategrense-forbruk (telles ikke separat — kun selve
        // tools/call-kallet er talt).
        let exists = true;
        try {
          await api.getListingApi({ auth, externalRef });
        } catch (error) {
          if (isNotFoundError(error)) exists = false;
          else throw error;
        }
        if (!exists) sentStatus = "draft";
      }
    }

    const body = withoutUndefined({ ...rest, status: sentStatus });
    const result = await api.upsertListingApi({
      auth,
      externalRef,
      body,
      dryRun: false,
      allowDraftStatus: true,
    });

    const verb =
      result.status === "created"
        ? "opprettet"
        : result.status === "updated"
          ? "oppdatert"
          : result.status === "unchanged"
            ? "uendret (ingen felt å lagre)"
            : "fantes allerede (create-modus, duplicate)";
    const warning = result.warning ? ` Merk: ${result.warning}` : "";
    return {
      text: `Annonsen ${result.externalRef} er ${verb}. ${draftNote(sentStatus)}${warning}`,
      structured: result,
    };
  },
};

const setListingStatus: McpTool = {
  name: "set_listing_status",
  description:
    'Sett status på en annonse (active/sold/archived) — dette er hvordan du PUBLISERER en annonse som ble opprettet som utkast: {status: "active"}.',
  inputSchema: {
    type: "object",
    required: ["externalRef", "status"],
    properties: {
      externalRef: externalRefProperty,
      status: { type: "string", enum: ["active", "sold", "archived"] },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      externalRef: { type: "string" },
      listingId: { type: "string", format: "uuid" },
      status: { type: "string" },
      changed: { type: "boolean" },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  scope: "listings:write",
  rateLimitKind: "write",
  async execute(auth, args) {
    const externalRef = asString(args.externalRef) ?? "";
    const status = asString(args.status);
    const api = await loadApi();
    const result = await api.setListingStatusApi({ auth, externalRef, body: { status } });
    return {
      text: `Status for ${result.externalRef} er nå «${result.status}»${result.changed ? "" : " (uendret — var allerede slik)"}.`,
      structured: result,
    };
  },
};

const renewListings: McpTool = {
  name: "renew_listings",
  description: `Forny expires_at med ${INTEGRATION_LIMITS.listingRenewalDays} dager for en liste externalRef-er, uten å sende hele annonseinnholdet på nytt.`,
  inputSchema: {
    type: "object",
    required: ["externalRefs"],
    properties: {
      externalRefs: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: MAX_RENEW_REFS,
      },
      locationId: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      importId: { type: "string", format: "uuid" },
      renewed: { type: "integer" },
      reactivated: { type: "integer" },
      skipped: { type: "integer" },
      notFound: { type: "array", items: { type: "string" } },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  scope: "listings:write",
  rateLimitKind: "batch",
  async execute(auth, args) {
    const api = await loadApi();
    const result = await api.renewListingsApi({
      auth,
      body: { externalRefs: args.externalRefs, locationId: args.locationId },
    });
    const notFound = result.notFound.length ? ` Fant ikke: ${result.notFound.join(", ")}.` : "";
    return {
      text: `Fornyet ${result.renewed}, reaktivert ${result.reactivated}, hoppet over ${result.skipped}.${notFound}`,
      structured: result,
    };
  },
};

const addListingImages: McpTool = {
  name: "add_listing_images",
  description:
    "Erstatt HELE bildesettet for en annonse med en liste https://-URL-er (ikke filopplasting). " +
    "Bildene behandles asynkront og komprimeres på samme måte som i veiviseren (WebP, EXIF-retting) — " +
    "sjekk resultatet med get_listing.",
  inputSchema: {
    type: "object",
    required: ["externalRef", "urls"],
    properties: {
      externalRef: externalRefProperty,
      urls: {
        type: "array",
        items: { type: "string", format: "uri", maxLength: MAX_IMPORT_IMAGE_URL_LENGTH },
        maxItems: MAX_IMPORT_IMAGES,
        description:
          "https://-URL-er. Erstatter hele det lagrede bildesettet — send alle du vil beholde.",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      externalRef: { type: "string" },
      images: { type: "array", items: imageStatusSchema },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  scope: "listings:write",
  rateLimitKind: "write",
  async execute(auth, args) {
    const externalRef = asString(args.externalRef) ?? "";
    const api = await loadApi();
    const result = await api.replaceListingImagesApi({
      auth,
      externalRef,
      body: { urls: args.urls },
    });
    return {
      text:
        `${result.images.length} bilde(r) lagt i kø for ${result.externalRef}. ` +
        "Behandles asynkront (komprimering som i veiviseren) — kall get_listing for å se når de er «done».",
      structured: result,
    };
  },
};

export const MCP_TOOLS: McpTool[] = [
  listCategories,
  getCategoryFields,
  listLocations,
  listListings,
  getListing,
  validateListing,
  upsertListing,
  setListingStatus,
  renewListings,
  addListingImages,
];

export function findMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}
