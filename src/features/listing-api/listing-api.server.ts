/**
 * Forretningslogikk for `/api/v1/…` (fase 4, del 2 — se
 * /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md).
 * Rutefilene (`src/routes/api/v1/…`) er tynne: de parser `Request`/`params`,
 * kaller én av funksjonene her, og serialiserer resultatet med
 * `apiJson`/`apiError` (api-response.server.ts). All faktisk validering,
 * tilgangskontroll og databaselogikk ligger her, og gjenbruker det samme
 * synk-tjenestelaget som Excel-importen (`listing-sync.server.ts`) — se
 * `SyncSource: "api"`.
 *
 * Denne modulen ligger under `src/features/`, så `scripts/check-server-boundary.mjs`
 * forbyr enhver linje som importerer fra en `*.server`-modul herfra — også
 * rene typeimporter, siden sjekken er en enkel linje-regex, ikke en ekte
 * typesjekk (se `import("...")`-typeuttrykkene under, som IKKE inneholder
 * `from` og derfor ikke trigger den). `loadDeps()` importerer selve
 * kjøretidsmodulene dynamisk.
 */
import { INTEGRATION_LIMITS, newImagesPerDayLimitMessage } from "@/lib/integration-limits";
import { publicImageUrl } from "@/lib/image-url";
import { normalizeFilter, type CategoryNode } from "@/lib/category-filters";
import {
  bulkImportRowSchema,
  normalizeBulkImportRow,
  MAX_IMPORT_IMAGES,
  MAX_IMPORT_IMAGE_URL_LENGTH,
  type BulkImportRow,
} from "@/features/listing-bulk-import/import-schema";
import { templateFiltersForCategory } from "@/features/listing-bulk-import/template";

/** Strukturelt lik `AuthenticatedApiKey`, definert der API-nøkkelen
 * autentiseres (`src/lib/api-keys.server.ts`) — duplisert som et minimalt
 * lokalt type i stedet for importert, siden selv en type-only importlinje av
 * en server-modul trigger `check-server-boundary.mjs` sin (linjebaserte)
 * sjekk. Kallerne (`src/routes/api/v1/...`) sender inn det ekte objektet fra
 * `withApiHandler`; TypeScripts strukturelle typing gjør resten. */
export type ApiKeyAuth = {
  keyId: string;
  organizationId: string;
  actingUserId: string;
  defaultLocationId: string;
  scopes: ("listings:read" | "listings:write")[];
};

/**
 * Forretningsfeil for `/api/v1/…`. `withApiHandler` (src/lib/api-handler.server.ts)
 * gjenkjenner disse strukturelt (status/code/message/field) uten å importere
 * denne klassen — se kommentaren der.
 */
export class ListingApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  /** Markør som `withApiHandler` krever før meldingen vises til kunden. */
  readonly isApiBusinessError = true;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ListingApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** Dynamisk import av `supabaseAdmin` og hele `listing-sync.server.ts`-API-et
 * — se filkommentaren. Modulsystemet cacher selve importen, så gjentatte
 * kall i samme forespørsel koster ikke noe ekstra nettverkskall. */
async function loadDeps() {
  const [{ supabaseAdmin }, sync] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/features/listing-bulk-import/listing-sync.server"),
  ]);
  return { supabaseAdmin, ...sync };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;
type SupabaseAdmin = Deps["supabaseAdmin"];
// Utledet fra `Deps` (et `import("...")`-typeuttrykk, ikke en `from`-linje)
// i stedet for et eget typeimport av listing-sync.server.ts — se filkommentaren.
type OrganizationActor = Awaited<ReturnType<Deps["actorFromApiKey"]>>;
type SyncContext = Awaited<ReturnType<Deps["loadSyncContext"]>>;

function publicListingUrl(kaupetCode: string): string {
  const origin = (process.env.PUBLIC_SITE_URL ?? "https://kaupet.no").replace(/\/+$/, "");
  return `${origin}/${kaupetCode}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Aktøren API-kallet skal utføres som: nøkkelens organisasjon/bruker, og
 * enten den lokasjonen forespørselen ba om (`body.locationId`) eller
 * nøkkelens standardlokasjon. Alle throws her er trygge, norske
 * kundemeldinger (se `actorFromApiKey`), så de sendes uendret som 403. */
async function resolveActorOnly(
  auth: ApiKeyAuth,
  locationId: string | undefined,
): Promise<{ supabaseAdmin: SupabaseAdmin; actor: OrganizationActor }> {
  const { supabaseAdmin, actorFromApiKey } = await loadDeps();
  try {
    const actor = await actorFromApiKey(supabaseAdmin, {
      organizationId: auth.organizationId,
      actingUserId: auth.actingUserId,
      locationId: locationId ?? auth.defaultLocationId,
      source: "api",
    });
    return { supabaseAdmin, actor };
  } catch (error) {
    throw new ListingApiError(
      403,
      "forbidden",
      error instanceof Error ? error.message : "Du har ikke tilgang til denne handlingen.",
    );
  }
}

async function resolveActorAndContext(
  auth: ApiKeyAuth,
  locationId: string | undefined,
): Promise<{ supabaseAdmin: SupabaseAdmin; actor: OrganizationActor; ctx: SyncContext }> {
  const { supabaseAdmin, actor } = await resolveActorOnly(auth, locationId);
  const { loadSyncContext } = await loadDeps();
  const ctx = await loadSyncContext(supabaseAdmin, actor);
  return { supabaseAdmin, actor, ctx };
}

function extractLocationId(body: unknown): string | undefined {
  const value = asRecord(body).locationId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** JSON-body (engelske feltnavn, se docs/PROFF-API.md) → `BulkImportRow`.
 * Selve valideringen (typer, lengder, påkrevde felt) skjer i
 * `bulkImportRowSchema`/`validateSyncRow` — denne funksjonen mapper bare
 * feltnavn, akkurat som `normalizeBulkImportRow` gjør for Excel-rader. */
export function mapApiBodyToRow(
  body: unknown,
  externalRef: string,
  rowNumber: number,
): BulkImportRow {
  const input = asRecord(body);
  return normalizeBulkImportRow(
    {
      externalId: externalRef,
      category: input.category,
      title: input.title,
      description: input.description,
      priceNok: input.price,
      subtitle: input.subtitle,
      condition: input.condition,
      canShip: input.canShip,
      knownIssues: input.knownIssues,
      noKnownIssues: input.noKnownIssues,
      maintenanceHistory: input.maintenanceHistory,
      status: input.status,
      imageUrls: input.images,
      attributes: input.attributes,
    },
    rowNumber,
  );
}

/** Kjører kun zod-skjemaet (ikke forretningsreglene — de sjekkes uansett av
 * `syncListings`), og kaster en `ListingApiError` MED feltnavn for første
 * feilende felt. Gir presise `422`-er for åpenbare feil (manglende tittel,
 * negativ pris o.l.) uten å duplisere skjemaet.
 *
 * `allowDraftStatus`: kun MCP-verktøyet `upsert_listing` (og `validate_listing`)
 * setter denne — `bulkImportRowSchema.status` (delt med Excel-importen)
 * godtar bare active/sold/archived, men `upsert_listing_from_external`
 * (20260924100000_listing_external_sync.sql, linje ~150) har alltid støttet
 * `status: 'draft'` ved OPPRETTELSE av en ny annonse — det er kun REST- og
 * Excel-lagene som aldri har sendt den verdien videre. Vi validerer derfor
 * resten av raden som normalt, men hopper over enum-sjekken når verdien er
 * nøyaktig «draft». Sender man «draft» ved OPPDATERING av en eksisterende
 * annonse, avviser RPC-en det uansett (fanget, graceful 422 — se
 * `callUpsert`/`upsert_listing_from_external`s `EXCEPTION WHEN OTHERS`), så
 * det er trygt å ikke skille de to tilfellene her. */
function assertSchemaValid(row: BulkImportRow, allowDraftStatus = false): void {
  const isDraft = allowDraftStatus && (row.status as string) === "draft";
  const rowToValidate = isDraft ? { ...row, status: undefined } : row;
  const parsed = bulkImportRowSchema.safeParse(rowToValidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path?.[0] ?? "") || undefined;
    throw new ListingApiError(
      422,
      "validation_error",
      issue?.message ?? "Ugyldige feltverdier.",
      field,
    );
  }
}

// --- Kategorier -------------------------------------------------------

export async function listCategoriesApi(): Promise<
  { id: string; slug: string; name: string; parentId: string | null }[]
> {
  const { supabaseAdmin } = await loadDeps();
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, slug, name_nb, parent_id");
  if (error) throw error;
  return (data ?? []).map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name_nb,
    parentId: category.parent_id,
  }));
}

export type CategoryFieldApi = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  unit: string | null;
  allowedValues: { value: string; label: string }[] | null;
  dependsOn: { key: string; value?: string; notValue?: string } | null;
};

/** Samme utvalg og krav-logikk som «Kategorifelter»-arket i Excel-malen
 * (`templateFiltersForCategory`, template.ts) — gjenbrukt her i stedet for
 * duplisert, slik at API-et og malen aldri kan vise ulike felt/krav for
 * samme kategori. */
export async function getCategoryFieldsApi(categoryId: string): Promise<CategoryFieldApi[]> {
  const { supabaseAdmin } = await loadDeps();
  const [{ data: categories, error: categoryError }, { data: filterRows, error: filterError }] =
    await Promise.all([
      supabaseAdmin.from("categories").select("id, parent_id"),
      supabaseAdmin.from("category_filters").select("*"),
    ]);
  if (categoryError) throw categoryError;
  if (filterError) throw filterError;
  const categoriesById = new Map<string, CategoryNode>(
    (categories ?? []).map((category) => [category.id, category]),
  );
  if (!categoriesById.has(categoryId)) {
    throw new ListingApiError(404, "not_found", "Fant ikke kategorien.");
  }
  const filters = (filterRows ?? []).map(normalizeFilter);
  const fields = templateFiltersForCategory(categoryId, filters, categoriesById);
  return fields.map((filter) => ({
    key: filter.key,
    label: filter.label_nb,
    type: filter.type,
    required: !filter.is_optional && !filter.depends_on_key,
    unit: filter.unit ?? null,
    allowedValues: filter.options
      ? filter.options.map((option) => ({ value: option.value, label: option.label_nb }))
      : null,
    dependsOn: filter.depends_on_key
      ? {
          key: filter.depends_on_key,
          value: filter.depends_on_value ?? undefined,
          notValue: filter.depends_on_not_value ?? undefined,
        }
      : null,
  }));
}

// --- Lokasjoner ---------------------------------------------------------

export type LocationApi = {
  id: string;
  name: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  isDefault: boolean;
};

/** Lokasjoner i nøkkelens organisasjon som den utøvende brukeren har tilgang
 * til — superbrukere ser alle, andre kun tildelte lokasjoner (samme regel
 * som `actorFromApiKey`/`resolveOrganizationActor` håndhever ved skriving). */
export async function listLocationsApi(auth: ApiKeyAuth): Promise<LocationApi[]> {
  const { supabaseAdmin } = await loadDeps();
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", auth.organizationId)
    .eq("user_id", auth.actingUserId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  const isSuperuser = membership?.role === "superuser";

  let allowedLocationIds: Set<string> | null = null;
  if (!isSuperuser) {
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from("organization_location_members")
      .select("location_id")
      .eq("user_id", auth.actingUserId);
    if (assignmentError) throw assignmentError;
    allowedLocationIds = new Set((assignments ?? []).map((row) => row.location_id));
  }

  const { data: locations, error } = await supabaseAdmin
    .from("organization_locations")
    .select("id, name, address_line, postal_code, city")
    .eq("organization_id", auth.organizationId)
    .eq("active", true);
  if (error) throw error;

  return (locations ?? [])
    .filter((location) => isSuperuser || allowedLocationIds!.has(location.id))
    .map((location) => ({
      id: location.id,
      name: location.name,
      addressLine: location.address_line,
      postalCode: location.postal_code,
      city: location.city,
      isDefault: location.id === auth.defaultLocationId,
    }));
}

// --- Bilder --------------------------------------------------------------

export type ListingImageStatusApi = {
  sourceUrl: string;
  status: "pending" | "processing" | "done" | "failed";
  url: string | null;
  error?: string;
};

async function getListingImagesStatus(
  supabaseAdmin: SupabaseAdmin,
  listingId: string,
): Promise<ListingImageStatusApi[]> {
  const [{ data: jobs, error: jobsError }, { data: images, error: imagesError }] =
    await Promise.all([
      supabaseAdmin
        .from("listing_image_jobs")
        .select("source_url, status, customer_error, sort_order")
        .eq("listing_id", listingId)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("listing_images")
        .select("storage_path, source_url")
        .eq("listing_id", listingId),
    ]);
  if (jobsError) throw jobsError;
  if (imagesError) throw imagesError;

  const pathBySourceUrl = new Map(
    (images ?? [])
      .filter((image) => image.source_url)
      .map((image) => [image.source_url as string, image.storage_path]),
  );

  return (jobs ?? []).map((job) => {
    const storagePath = pathBySourceUrl.get(job.source_url);
    const entry: ListingImageStatusApi = {
      sourceUrl: job.source_url,
      status: job.status as ListingImageStatusApi["status"],
      url: job.status === "done" && storagePath ? publicImageUrl(storagePath) : null,
    };
    // Kun `customer_error` — ALDRI `internal_error` (se listing_image_jobs
    // sin kolonne-GRANT-kommentar, 20260924130000_listing_image_jobs.sql).
    if (job.status === "failed" && job.customer_error) entry.error = job.customer_error;
    return entry;
  });
}

async function assertImageQuota(
  supabaseAdmin: SupabaseAdmin,
  organizationId: string,
  needed: number,
): Promise<void> {
  if (needed <= 0) return;
  const { startOfUtcDayIso } = await loadDeps();
  const { count, error } = await supabaseAdmin
    .from("listing_image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", startOfUtcDayIso());
  if (error) throw error;
  const remaining = Math.max(0, INTEGRATION_LIMITS.organization.newImagesPerDay - (count ?? 0));
  if (remaining < needed) {
    throw new ListingApiError(422, "validation_error", newImagesPerDayLimitMessage(), "images");
  }
}

function assertImageUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) {
    throw new ListingApiError(
      422,
      "validation_error",
      "Oppgi «urls» som en liste med bilde-URL-er.",
      "urls",
    );
  }
  if (urls.length > MAX_IMPORT_IMAGES) {
    throw new ListingApiError(
      422,
      "validation_error",
      `Maks ${MAX_IMPORT_IMAGES} bilder per annonse.`,
      "urls",
    );
  }
  const normalized = urls.map((url) => String(url).trim());
  for (const url of normalized) {
    if (url.length > MAX_IMPORT_IMAGE_URL_LENGTH || !url.startsWith("https://")) {
      throw new ListingApiError(
        422,
        "validation_error",
        "Hver bilde-URL må starte med https:// og være gyldig.",
        "urls",
      );
    }
  }
  return normalized;
}

// --- Annonser --------------------------------------------------------------

export type UpsertListingApiResult = {
  importId: string;
  status: "created" | "updated" | "unchanged" | "duplicate";
  externalRef: string;
  listingId?: string;
  kaupetCode?: string;
  warning?: string;
};

export async function upsertListingApi(params: {
  auth: ApiKeyAuth;
  externalRef: string;
  body: unknown;
  dryRun: boolean;
  /** Kun satt av MCP-verktøyene (`mcp-tools.ts`) — se `assertSchemaValid`.
   * REST-endepunktet (`/api/v1/listings/{externalRef}`) sender aldri denne,
   * så REST-oppførselen er uendret. */
  allowDraftStatus?: boolean;
}): Promise<UpsertListingApiResult> {
  const { auth, externalRef, body, dryRun, allowDraftStatus } = params;
  if (!externalRef || externalRef.trim().length === 0 || externalRef.length > 120) {
    throw new ListingApiError(
      422,
      "validation_error",
      "Ugyldig ekstern referanse i URL-en.",
      "externalRef",
    );
  }

  const locationId = extractLocationId(body);
  const { supabaseAdmin, ctx } = await resolveActorAndContext(auth, locationId);

  const row = mapApiBodyToRow(body, externalRef, 1);
  assertSchemaValid(row, allowDraftStatus);

  const { syncListings } = await loadDeps();
  const importId = crypto.randomUUID();
  const [result] = await syncListings(supabaseAdmin, ctx, {
    importId,
    rows: [row],
    mode: "upsert",
    dryRun,
  });

  if (result.status === "failed") {
    throw new ListingApiError(
      422,
      "validation_error",
      result.error ?? "Annonsen kunne ikke lagres.",
    );
  }

  return {
    importId,
    status: result.status,
    externalRef: result.externalId,
    listingId: result.listingId,
    kaupetCode: result.kaupetCode,
    warning: result.warning,
  };
}

export type BatchUpsertApiResult = {
  importId: string;
  results: {
    rowNumber: number;
    externalRef: string;
    status: "created" | "updated" | "unchanged" | "duplicate" | "failed";
    listingId?: string;
    kaupetCode?: string;
    error?: string;
    warning?: string;
  }[];
};

export async function batchUpsertListingsApi(params: {
  auth: ApiKeyAuth;
  body: unknown;
}): Promise<BatchUpsertApiResult> {
  const { auth, body } = params;
  const input = asRecord(body);
  const mode = input.mode === "create" ? "create" : "upsert";
  const dryRun = input.dryRun === true;
  const rawRows = input.rows;

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new ListingApiError(422, "validation_error", "Oppgi minst én rad i «rows».", "rows");
  }
  if (rawRows.length > INTEGRATION_LIMITS.maxBatchRows) {
    throw new ListingApiError(
      422,
      "validation_error",
      `Maks ${INTEGRATION_LIMITS.maxBatchRows} rader per forespørsel.`,
      "rows",
    );
  }

  const locationId = extractLocationId(body);
  const { supabaseAdmin, ctx } = await resolveActorAndContext(auth, locationId);

  const rows = rawRows.map((entry, index) => {
    const entryRecord = asRecord(entry);
    const externalRef = String(entryRecord.externalRef ?? entryRecord.externalId ?? "").trim();
    return mapApiBodyToRow(entryRecord, externalRef, index + 1);
  });

  const { syncListings } = await loadDeps();
  const importId = crypto.randomUUID();
  const results = await syncListings(supabaseAdmin, ctx, { importId, rows, mode, dryRun });

  return {
    importId,
    results: results.map((result) => ({
      rowNumber: result.rowNumber,
      externalRef: result.externalId,
      status: result.status,
      listingId: result.listingId,
      kaupetCode: result.kaupetCode,
      error: result.error,
      warning: result.warning,
    })),
  };
}

export type RenewApiResult = {
  importId: string;
  renewed: number;
  reactivated: number;
  skipped: number;
  notFound: string[];
};

const MAX_RENEW_REFS = 1000;

export async function renewListingsApi(params: {
  auth: ApiKeyAuth;
  body: unknown;
}): Promise<RenewApiResult> {
  const { auth, body } = params;
  const input = asRecord(body);
  const externalRefs = Array.isArray(input.externalRefs)
    ? input.externalRefs.map((value) => String(value).trim()).filter(Boolean)
    : null;
  if (!externalRefs || externalRefs.length === 0) {
    throw new ListingApiError(
      422,
      "validation_error",
      "Oppgi minst én referanse i «externalRefs».",
      "externalRefs",
    );
  }
  if (externalRefs.length > MAX_RENEW_REFS) {
    throw new ListingApiError(
      422,
      "validation_error",
      `Maks ${MAX_RENEW_REFS} eksterne referanser per kall.`,
      "externalRefs",
    );
  }

  const locationId = extractLocationId(body);
  const { supabaseAdmin, actor } = await resolveActorOnly(auth, locationId);
  const { renewListingsByExternalRef } = await loadDeps();
  const importId = crypto.randomUUID();
  const result = await renewListingsByExternalRef(supabaseAdmin, actor, { importId, externalRefs });
  return { importId, ...result };
}

export async function setListingStatusApi(params: {
  auth: ApiKeyAuth;
  externalRef: string;
  body: unknown;
}): Promise<{ externalRef: string; listingId: string; status: string; changed: boolean }> {
  const { auth, externalRef, body } = params;
  const status = asRecord(body).status;
  if (status !== "active" && status !== "sold" && status !== "archived") {
    throw new ListingApiError(
      422,
      "validation_error",
      "Status må være active, sold eller archived.",
      "status",
    );
  }

  const { supabaseAdmin, actor } = await resolveActorOnly(auth, undefined);
  const { setListingStatusByExternalRef } = await loadDeps();
  try {
    const result = await setListingStatusByExternalRef(supabaseAdmin, actor, externalRef, status);
    return {
      externalRef,
      listingId: result.listingId,
      status: result.listingStatus,
      changed: result.changed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Statusen kunne ikke endres.";
    if (message.includes("Fant ingen annonse")) {
      throw new ListingApiError(404, "not_found", message);
    }
    throw new ListingApiError(422, "validation_error", message, "status");
  }
}

export async function replaceListingImagesApi(params: {
  auth: ApiKeyAuth;
  externalRef: string;
  body: unknown;
}): Promise<{ externalRef: string; images: ListingImageStatusApi[] }> {
  const { auth, externalRef, body } = params;
  const urls = assertImageUrls(asRecord(body).urls);

  const { supabaseAdmin } = await resolveActorOnly(auth, undefined);
  const { data: listing, error } = await supabaseAdmin
    .from("listings")
    .select("id")
    .eq("organization_id", auth.organizationId)
    .eq("external_ref", externalRef)
    .maybeSingle();
  if (error) throw error;
  if (!listing)
    throw new ListingApiError(404, "not_found", "Fant ingen annonse med denne referansen.");

  await assertImageQuota(supabaseAdmin, auth.organizationId, urls.length);

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_listing_image_jobs", {
    _organization_id: auth.organizationId,
    _listing_id: listing.id,
    _urls: urls,
    _replace: true,
  });
  if (enqueueError) throw enqueueError;

  const images = await getListingImagesStatus(supabaseAdmin, listing.id);
  return { externalRef, images };
}

// --- Lesing ---------------------------------------------------------------

export type ListingApi = {
  externalRef: string;
  kaupetCode: string;
  status: string;
  title: string;
  priceNok: number | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  publicUrl: string;
};

export async function getListingApi(params: {
  auth: ApiKeyAuth;
  externalRef: string;
}): Promise<ListingApi & { images: ListingImageStatusApi[] }> {
  const { auth, externalRef } = params;
  const { supabaseAdmin } = await loadDeps();
  const { data: listing, error } = await supabaseAdmin
    .from("listings")
    .select(
      "id, external_ref, kaupet_code, status, title, price_nok, created_at, updated_at, expires_at",
    )
    .eq("organization_id", auth.organizationId)
    .eq("external_ref", externalRef)
    .maybeSingle();
  if (error) throw error;
  if (!listing)
    throw new ListingApiError(404, "not_found", "Fant ingen annonse med denne referansen.");

  const images = await getListingImagesStatus(supabaseAdmin, listing.id);
  return {
    externalRef: listing.external_ref!,
    kaupetCode: listing.kaupet_code,
    status: listing.status,
    title: listing.title,
    priceNok: listing.price_nok,
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    expiresAt: listing.expires_at,
    publicUrl: publicListingUrl(listing.kaupet_code),
    images,
  };
}

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

function encodeCursor(row: { updated_at: string; id: string }): string {
  return btoa(JSON.stringify([row.updated_at, row.id]));
}

function decodeCursor(raw: string): { updatedAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(atob(raw));
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return { updatedAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // Ugyldig cursor: behandles som "ingen cursor" under.
  }
  return null;
}

export async function listListingsApi(params: {
  auth: ApiKeyAuth;
  searchParams: URLSearchParams;
}): Promise<{ items: ListingApi[]; nextCursor: string | null }> {
  const { auth, searchParams } = params;

  const rawLimit = Number(searchParams.get("limit") ?? DEFAULT_LIST_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
  const LISTING_STATUSES = ["draft", "active", "sold", "archived", "expired", "disabled"] as const;
  const rawStatus = searchParams.get("status");
  const status = rawStatus
    ? LISTING_STATUSES.find((candidate) => candidate === rawStatus)
    : undefined;
  if (rawStatus && !status) {
    throw new ListingApiError(422, "validation_error", "Ugyldig status-filter.", "status");
  }
  const updatedSince = searchParams.get("updatedSince");
  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) {
    throw new ListingApiError(422, "validation_error", "Ugyldig cursor.", "cursor");
  }

  const { supabaseAdmin } = await loadDeps();
  let query = supabaseAdmin
    .from("listings")
    .select(
      "id, external_ref, kaupet_code, status, title, price_nok, created_at, updated_at, expires_at",
    )
    .eq("organization_id", auth.organizationId)
    .not("external_ref", "is", null)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (status) query = query.eq("status", status);
  if (updatedSince) query = query.gte("updated_at", updatedSince);
  if (cursor) {
    query = query.or(
      `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => ({
      externalRef: row.external_ref!,
      kaupetCode: row.kaupet_code,
      status: row.status,
      title: row.title,
      priceNok: row.price_nok,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      publicUrl: publicListingUrl(row.kaupet_code),
    })),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}
