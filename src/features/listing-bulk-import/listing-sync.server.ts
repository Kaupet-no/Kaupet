import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  getMissingRequiredFilters,
  isBoatCategory,
  normalizeFilter,
  vehicleCategoryGroupFor,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryNode,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  effectiveFlowForCategory,
  type CategoryFlowRow,
} from "@/features/listing-creation/category-flows";
import { validateRequiredFieldGroups } from "@/features/listing-creation/field-groups/validators";
import { INTEGRATION_LIMITS, newListingsPerDayLimitMessage } from "@/lib/integration-limits";
import { bulkImportRowSchema, normalizeBulkImportRow, type BulkImportRow } from "./import-schema";

/** Innkommende kanal for en synk. `excel` er dagens filopplasting; `api` og
 * `mcp` (fase 4/5) bruker samme tjenestelag via en API-nøkkel. */
export type SyncSource = "excel" | "api" | "mcp";

type OrganizationListingLocation = {
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  address_line: string | null;
};

/** Aktøren en synk utføres på vegne av — identisk uansett om den kommer fra
 * en innlogget brukersesjon (Excel) eller en API-nøkkel (API/MCP). */
export type OrganizationActor = {
  organizationId: string;
  userId: string;
  locationId: string;
  showVisitingAddress: boolean;
  source: SyncSource;
  location: OrganizationListingLocation;
};

type CategoryRecord = CategoryNode & { slug: string; name_nb: string };

/** Aktøren utvidet med kategori-/filter-/flowkonteksten en synk trenger for
 * å validere og opprette/oppdatere rader. */
export type SyncContext = OrganizationActor & {
  categoryAccess: "all" | "restricted";
  allowedCategoryIds: Set<string>;
  categories: CategoryRecord[];
  categoriesById: Map<string, CategoryRecord>;
  filters: ReturnType<typeof normalizeFilter>[];
  flows: CategoryFlowRow[];
};

export type ListingSyncStatus = "created" | "updated" | "unchanged" | "duplicate" | "failed";

export type ListingSyncResult = {
  rowNumber: number;
  externalId: string;
  status: ListingSyncStatus;
  listingId?: string;
  kaupetCode?: string;
  error?: string;
};

const BATCH_SIZE = 25;
const REF_LOOKUP_CHUNK_SIZE = 100;

/** Interne feil (databasefeil, RPC-unntak o.l.) lekkes aldri til kunden — kun
 * de kjente, brukervendte valideringsmeldingene slipper gjennom uendret. */
function safeRowError(message: string): string {
  if (
    message.startsWith("Fyll inn:") ||
    message.startsWith("Velg ") ||
    message.startsWith("Legg til ")
  ) {
    return message;
  }
  return "Raden kunne ikke opprettes. Kontroller feltene og prøv igjen.";
}

function resolveCategory(category: string, categories: CategoryRecord[]): CategoryRecord | null {
  const normalized = category.trim().toLocaleLowerCase("nb-NO");
  return (
    categories.find(
      (candidate) =>
        candidate.id === category ||
        candidate.slug.toLocaleLowerCase("nb-NO") === normalized ||
        candidate.name_nb.toLocaleLowerCase("nb-NO") === normalized,
    ) ?? null
  );
}

/** Medlemskaps-, lokasjons- og Proff-tilgangssjekkene som gjelder uansett
 * kanal. Kaster de samme norske feilmeldingene som dagens Excel-import. */
export async function resolveOrganizationActor(
  supabaseAdmin: SupabaseClient<Database>,
  params: {
    userId: string;
    locationId: string;
    showVisitingAddress: boolean;
    source: SyncSource;
  },
): Promise<OrganizationActor> {
  const { userId, locationId, showVisitingAddress, source } = params;
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, status, can_create_listings, category_access")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Du har ikke tilgang til Proff-import.");
  if (membership.role === "member" && !membership.can_create_listings) {
    throw new Error("Du har ikke tilgang til å opprette annonser.");
  }
  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("organization_location_members")
    .select("location_id")
    .eq("location_id", locationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  const { data: location, error: locationError } = await supabaseAdmin
    .from("organization_locations")
    .select("postal_code, city, lat, lng, address_line")
    .eq("id", locationId)
    .eq("organization_id", membership.organization_id)
    .eq("active", true)
    .single();
  if (locationError) throw locationError;
  if (membership.role !== "superuser" && !assignment) {
    throw new Error("Du har ikke tilgang til denne lokasjonen.");
  }
  const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
    _organization_id: membership.organization_id,
  });
  if (syncError) throw syncError;
  const { data: hasAccess, error: accessError } = await supabaseAdmin.rpc(
    "organization_has_proff_access",
    { _organization_id: membership.organization_id },
  );
  if (accessError) throw accessError;
  if (!hasAccess) throw new Error("Proff-tilgang er ikke aktiv.");

  return {
    organizationId: membership.organization_id,
    userId,
    locationId,
    showVisitingAddress,
    source,
    location: location as OrganizationListingLocation,
  };
}

/** Kategorier, kategoritilgang, filtre og flows for aktørens organisasjon. */
export async function loadSyncContext(
  supabaseAdmin: SupabaseClient<Database>,
  actor: OrganizationActor,
): Promise<SyncContext> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("category_access")
    .eq("user_id", actor.userId)
    .eq("organization_id", actor.organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  const categoryAccess = (membership?.category_access as "all" | "restricted" | undefined) ?? "all";

  const [
    { data: categories, error: categoryError },
    { data: memberCategories, error: memberCategoryError },
    { data: filters, error: filterError },
    { data: flows },
  ] = await Promise.all([
    supabaseAdmin.from("categories").select("id, parent_id, slug, name_nb"),
    categoryAccess === "restricted"
      ? supabaseAdmin
          .from("organization_member_categories")
          .select("category_id")
          .eq("organization_id", actor.organizationId)
          .eq("user_id", actor.userId)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("category_filters").select("*"),
    supabaseAdmin.from("category_flows").select("id, category_id, field_groups, sort_order"),
  ]);
  if (categoryError || memberCategoryError || filterError) {
    throw categoryError ?? memberCategoryError ?? filterError;
  }
  const categoryRows = (categories ?? []) as CategoryRecord[];
  return {
    ...actor,
    categoryAccess,
    allowedCategoryIds: new Set((memberCategories ?? []).map((row) => row.category_id)),
    categories: categoryRows,
    categoriesById: new Map(categoryRows.map((category) => [category.id, category])),
    filters: (filters ?? []).map(normalizeFilter),
    flows: (flows ?? []) as CategoryFlowRow[],
  };
}

function validateRowFields(row: BulkImportRow, ctx: SyncContext): string | null {
  const category = resolveCategory(row.category, ctx.categories);
  if (!category) return "Kategorien finnes ikke. Bruk kategorinavnet eller slug-en fra malen.";
  if (ctx.categoryAccess === "restricted" && !ctx.allowedCategoryIds.has(category.id)) {
    return "Du har ikke tilgang til denne kategorien.";
  }

  const attributes = row.attributes;
  const behavior = getCategoryBehavior(
    vehicleCategoryGroupFor(category.id, ctx.filters, ctx.categoriesById),
    isBoatCategory(category.id, ctx.filters, ctx.categoriesById),
  );
  const missing = behavior.requiresCategoryFilterValues
    ? getMissingRequiredFilters(category.id, ctx.filters, ctx.categoriesById, attributes, [
        ...VEHICLE_EQUIPMENT_FILTER_KEYS,
        ...behavior.requiredFilterExclusions,
      ])
    : [];
  if (missing.length > 0) return `Fyll inn: ${missing.map((filter) => filter.label_nb).join(", ")}`;

  const { fieldGroups } = effectiveFlowForCategory(category.id, ctx.flows, ctx.categoriesById);
  return validateRequiredFieldGroups(
    fieldGroups,
    { condition: row.condition ?? null, can_ship: row.canShip ?? null },
    behavior,
  );
}

/** Zod-skjema (import-schema.ts) + forretningsvalidering (kategori,
 * kategoritilgang, påkrevde filtre/felt) i ett steg, slik at både Excel-,
 * API- og MCP-rader valideres identisk.
 *
 * Skjemafeil (f.eks. «Tittelen må ha minst 5 tegn.») er allerede trygge,
 * spesifikke kundemeldinger og returneres uendret. Forretningsfeil kan i
 * prinsippet inneholde detaljer vi ikke vil eksponere, så de går gjennom
 * `safeRowError` her — akkurat som i dagens `validateRow`. */
export function validateSyncRow(
  row: BulkImportRow,
  ctx: SyncContext,
): { ok: true; row: BulkImportRow } | { ok: false; error: string } {
  const schemaResult = bulkImportRowSchema.safeParse(row);
  if (!schemaResult.success) {
    return { ok: false, error: schemaResult.error.issues.map((issue) => issue.message).join(" ") };
  }
  const normalized = normalizeBulkImportRow(schemaResult.data, row.rowNumber);
  const validationError = validateRowFields(normalized, ctx);
  if (validationError) return { ok: false, error: safeRowError(validationError) };
  return { ok: true, row: normalized };
}

/** UTC-midnatt for "i dag". Døgngrensen for nye annonser telles per
 * UTC-døgn, ikke Europe/Oslo: enklere å implementere og verifisere (ingen
 * sommertid-/DST-logikk), og i praksis forskyver det kun grensedøgnet med
 * 1–2 timer i norsk lokaltid, som er akseptabelt for en misbruksgrense. */
function startOfUtcDayIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

async function callUpsert(
  supabaseAdmin: SupabaseClient<Database>,
  ctx: SyncContext,
  importId: string,
  importSource: string,
  row: BulkImportRow,
  mode: "create" | "upsert",
  dryRun: boolean,
): Promise<ListingSyncResult> {
  const category = resolveCategory(row.category, ctx.categories)!;
  // Steg 4: her skal `row.imageUrls` (validert i import-schema.ts: kun
  // https://, maks 2048 tegn, maks MAX_IMPORT_IMAGES per rad) legges i kø som
  // bildejobber (`listing_image_jobs`) for annonsen RPC-en oppretter/
  // oppdaterer under. I dag tas de bare imot her og går ingen vei videre —
  // ingen bilder legges til `listing_images`.
  const { data, error } = await supabaseAdmin.rpc("upsert_listing_from_external", {
    _organization_id: ctx.organizationId,
    _user_id: ctx.userId,
    _location_id: ctx.locationId,
    _import_id: importId,
    _source: importSource,
    _external_ref: row.externalId,
    _listing: {
      title: row.title,
      subtitle: row.subtitle ?? "",
      description: row.description,
      category_id: category.id,
      condition: row.condition ?? "",
      is_free: false,
      price_nok: row.priceNok,
      postal_code: ctx.location.postal_code ?? "",
      city: ctx.location.city ?? "",
      lat: ctx.location.lat,
      lng: ctx.location.lng,
      can_ship: row.canShip ?? null,
      known_issues: row.knownIssues ?? "",
      no_known_issues: row.noKnownIssues ?? false,
      maintenance_history: row.maintenanceHistory ?? "",
      attributes: row.attributes,
      status: row.status ?? "",
    },
    _mode: mode,
    _show_visiting_address: ctx.showVisitingAddress,
    _dry_run: dryRun,
  });
  if (error) throw error;
  const result = (data ?? {}) as { status?: string; listing_id?: string; error?: string };
  if (
    result.status === "created" ||
    result.status === "updated" ||
    result.status === "unchanged" ||
    result.status === "duplicate"
  ) {
    return {
      rowNumber: row.rowNumber,
      externalId: row.externalId,
      status: result.status,
      listingId: result.listing_id,
    };
  }
  return {
    rowNumber: row.rowNumber,
    externalId: row.externalId,
    status: "failed",
    error: result.error ?? "Annonsen kunne ikke opprettes. Kontroller feltene.",
  };
}

/**
 * Validerer og synker et sett med rader (opprett eller upsert) mot
 * `upsert_listing_from_external`, batchet á `BATCH_SIZE` som i dag.
 *
 * Døgngrensen for nye annonser (`INTEGRATION_LIMITS.organization.newListingsPerDay`)
 * håndheves uten en ekstra databaserundtur per rad: vi henter (a) hvor mange
 * `external_id`-er i denne innsendingen som allerede finnes som `external_ref`
 * på en annonse i organisasjonen (ett samlet oppslag), og (b) hvor mange
 * annonser organisasjonen allerede har fått opprettet i dag (én telling). En
 * rad uten eksisterende referanse vil opprette en ny annonse og trekker fra
 * den gjenværende kvoten *før* RPC-kallet; når kvoten er brukt opp feiler
 * slike rader lokalt med en norsk feilmelding uten å nå databasen i det hele
 * tatt. Rader som oppdaterer en eksisterende referanse påvirkes aldri.
 * `dryRun` leser ikke kvoten (den skriver ingenting uansett).
 *
 * Merk: to rader i samme innsending med samme (ennå ikke eksisterende)
 * `external_id` telles begge mot kvoten selv om bare én av dem faktisk vil
 * opprette en annonse (den andre blir `duplicate` i databasen) — et bevisst,
 * lite konservativt avvik som unngår ekstra rundturer for et tilfelle
 * (duplikat-ID i samme fil) som uansett er en feil i kildedataene.
 */
export async function syncListings(
  supabaseAdmin: SupabaseClient<Database>,
  ctx: SyncContext,
  params: {
    importId: string;
    rows: BulkImportRow[];
    mode: "create" | "upsert";
    dryRun?: boolean;
  },
): Promise<ListingSyncResult[]> {
  const { importId, rows, mode, dryRun = false } = params;

  const externalIds = Array.from(
    new Set(rows.map((row) => String(row.externalId ?? "").trim()).filter(Boolean)),
  );
  const existingRefs = new Set<string>();
  // Oppslaget går som query-parametre; del opp så URL-en holder seg kort
  // også med 500 lange referanser.
  for (let offset = 0; offset < externalIds.length; offset += REF_LOOKUP_CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("listings")
      .select("external_ref")
      .eq("organization_id", ctx.organizationId)
      .in("external_ref", externalIds.slice(offset, offset + REF_LOOKUP_CHUNK_SIZE));
    if (error) throw error;
    for (const listing of data ?? []) {
      if (listing.external_ref) existingRefs.add(listing.external_ref);
    }
  }

  let remainingNewListings = Number.POSITIVE_INFINITY;
  if (!dryRun) {
    const { count, error } = await supabaseAdmin
      .from("organization_listing_imports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId)
      .eq("status", "created")
      .gte("created_at", startOfUtcDayIso());
    if (error) throw error;
    remainingNewListings = Math.max(
      0,
      INTEGRATION_LIMITS.organization.newListingsPerDay - (count ?? 0),
    );
  }

  const results: ListingSyncResult[] = [];
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (row): Promise<ListingSyncResult> => {
        const rowNumber = row.rowNumber;
        const externalId = String(row.externalId ?? "");
        const validated = validateSyncRow(row, ctx);
        if (!validated.ok) {
          return { rowNumber, externalId, status: "failed", error: validated.error };
        }
        const normalized = validated.row;
        const wouldCreate = !existingRefs.has(normalized.externalId);
        if (wouldCreate && (normalized.status === "sold" || normalized.status === "archived")) {
          return {
            rowNumber,
            externalId: normalized.externalId,
            status: "failed",
            error: "En ny annonse kan ikke opprettes som solgt eller arkivert.",
          };
        }
        if (wouldCreate && !dryRun) {
          if (remainingNewListings <= 0) {
            return {
              rowNumber,
              externalId: normalized.externalId,
              status: "failed",
              error: newListingsPerDayLimitMessage(),
            };
          }
          remainingNewListings -= 1;
        }
        try {
          return await callUpsert(
            supabaseAdmin,
            ctx,
            importId,
            ctx.source,
            normalized,
            mode,
            dryRun,
          );
        } catch {
          return {
            rowNumber,
            externalId: normalized.externalId,
            status: "failed",
            error: "Annonsen kunne ikke opprettes. Prøv igjen senere.",
          };
        }
      }),
    );

    const listingIds = Array.from(
      new Set(
        batchResults
          .filter((result) => result.status !== "failed" && result.listingId)
          .map((result) => result.listingId!),
      ),
    );
    if (listingIds.length > 0) {
      const { data: listingsWithCode, error: codeError } = await supabaseAdmin
        .from("listings")
        .select("id, kaupet_code")
        .in("id", listingIds);
      if (codeError) throw codeError;
      const codeById = new Map((listingsWithCode ?? []).map((row) => [row.id, row.kaupet_code]));
      for (const result of batchResults) {
        if (result.listingId && codeById.has(result.listingId)) {
          result.kaupetCode = codeById.get(result.listingId) ?? undefined;
        }
      }
    }

    results.push(...batchResults);
  }
  return results;
}

/** Tynn innpakning rundt `set_listing_status_by_external_ref` med norske
 * feilmeldinger for de kjente utfallene. */
export async function setListingStatusByExternalRef(
  supabaseAdmin: SupabaseClient<Database>,
  actor: OrganizationActor,
  externalRef: string,
  status: "active" | "sold" | "archived",
): Promise<{ listingId: string; listingStatus: string; changed: boolean }> {
  const { data, error } = await supabaseAdmin.rpc("set_listing_status_by_external_ref", {
    _organization_id: actor.organizationId,
    _user_id: actor.userId,
    _external_ref: externalRef,
    _status: status,
  });
  if (error) throw error;
  const result = (data ?? {}) as {
    status?: string;
    listing_id?: string;
    listing_status?: string;
    error?: string;
  };
  if (result.status === "not_found") {
    throw new Error("Fant ingen annonse med denne referansen.");
  }
  if (result.status === "failed") {
    throw new Error(result.error ?? "Statusen kunne ikke endres. Prøv igjen senere.");
  }
  if (!result.listing_id || !result.listing_status) {
    throw new Error("Statusen kunne ikke endres. Prøv igjen senere.");
  }
  return {
    listingId: result.listing_id,
    listingStatus: result.listing_status,
    changed: result.status === "status_changed",
  };
}

/** Tynn innpakning rundt `renew_listings_by_external_ref`. */
export async function renewListingsByExternalRef(
  supabaseAdmin: SupabaseClient<Database>,
  actor: OrganizationActor,
  params: { importId: string; externalRefs: string[] },
): Promise<{ renewed: number; reactivated: number; skipped: number; notFound: string[] }> {
  const { data, error } = await supabaseAdmin.rpc("renew_listings_by_external_ref", {
    _organization_id: actor.organizationId,
    _user_id: actor.userId,
    _import_id: params.importId,
    _source: actor.source,
    _external_refs: params.externalRefs,
  });
  if (error) throw error;
  const result = (data ?? {}) as {
    renewed?: number;
    reactivated?: number;
    skipped?: number;
    not_found?: string[];
  };
  return {
    renewed: result.renewed ?? 0,
    reactivated: result.reactivated ?? 0,
    skipped: result.skipped ?? 0,
    notFound: result.not_found ?? [],
  };
}
