import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
import { bulkImportRowSchema, normalizeBulkImportRow, type BulkImportRow } from "./import-schema";

type OrganizationListingLocation = {
  postal_code: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

const MAX_IMPORT_ROWS = 500;
const BATCH_SIZE = 25;
export type BulkImportResult = {
  rowNumber: number;
  externalId: string;
  status: "created" | "duplicate" | "failed";
  listingId?: string;
  kaupetCode?: string;
  error?: string;
};

type CategoryRecord = CategoryNode & { slug: string; name_nb: string };

type ImportContext = {
  organizationId: string;
  userId: string;
  categoryAccess: "all" | "restricted";
  allowedCategoryIds: Set<string>;
  categories: CategoryRecord[];
  categoriesById: Map<string, CategoryRecord>;
  filters: ReturnType<typeof normalizeFilter>[];
  flows: CategoryFlowRow[];
  /** Bedriftsadressen; annonsene får den, ikke en adresse fra filen. */
  location: OrganizationListingLocation;
};

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

async function loadImportContext(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
): Promise<ImportContext> {
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

  const [
    { data: categories, error: categoryError },
    { data: memberCategories, error: memberCategoryError },
    { data: filters, error: filterError },
    { data: flows },
  ] = await Promise.all([
    supabaseAdmin.from("categories").select("id, parent_id, slug, name_nb"),
    membership.category_access === "restricted"
      ? supabaseAdmin
          .from("organization_member_categories")
          .select("category_id")
          .eq("organization_id", membership.organization_id)
          .eq("user_id", userId)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("category_filters").select("*"),
    supabaseAdmin
      .from("category_flows")
      .select("id, category_id, field_groups, modules, sort_order"),
  ]);
  if (categoryError || memberCategoryError || filterError) {
    throw categoryError ?? memberCategoryError ?? filterError;
  }

  const categoryRows = (categories ?? []) as CategoryRecord[];
  const { organizationListingLocation } = await import("@/lib/organization-location.server");
  return {
    location: await organizationListingLocation(supabaseAdmin, membership.organization_id),
    organizationId: membership.organization_id,
    userId,
    categoryAccess: membership.category_access as ImportContext["categoryAccess"],
    allowedCategoryIds: new Set((memberCategories ?? []).map((row) => row.category_id)),
    categories: categoryRows,
    categoriesById: new Map(categoryRows.map((category) => [category.id, category])),
    filters: (filters ?? []).map(normalizeFilter),
    flows: (flows ?? []) as CategoryFlowRow[],
  };
}

function validateRow(row: BulkImportRow, context: ImportContext): string | null {
  const category = resolveCategory(row.category, context.categories);
  if (!category) return "Kategorien finnes ikke. Bruk kategorinavnet eller slug-en fra malen.";
  if (context.categoryAccess === "restricted" && !context.allowedCategoryIds.has(category.id)) {
    return "Du har ikke tilgang til denne kategorien.";
  }

  const attributes = row.attributes;
  const missing = getMissingRequiredFilters(
    category.id,
    context.filters,
    context.categoriesById,
    attributes,
    VEHICLE_EQUIPMENT_FILTER_KEYS,
  );
  if (missing.length > 0) return `Fyll inn: ${missing.map((filter) => filter.label_nb).join(", ")}`;

  const { fieldGroups } = effectiveFlowForCategory(
    category.id,
    context.flows,
    context.categoriesById,
  );
  const behavior = getCategoryBehavior(
    vehicleCategoryGroupFor(category.id, context.filters, context.categoriesById),
    isBoatCategory(category.id, context.filters, context.categoriesById),
  );
  return validateRequiredFieldGroups(
    fieldGroups,
    { condition: row.condition ?? null, can_ship: row.canShip ?? null },
    behavior,
  );
}

async function createRow(
  supabaseAdmin: SupabaseClient<Database>,
  context: ImportContext,
  importId: string,
  row: BulkImportRow,
): Promise<BulkImportResult> {
  const schemaResult = bulkImportRowSchema.safeParse(row);
  if (!schemaResult.success) {
    return {
      rowNumber: row.rowNumber,
      externalId: row.externalId,
      status: "failed",
      error: schemaResult.error.issues.map((issue) => issue.message).join(" "),
    };
  }
  const normalized = normalizeBulkImportRow(schemaResult.data, row.rowNumber);
  const validationError = validateRow(normalized, context);
  if (validationError) {
    return {
      rowNumber: row.rowNumber,
      externalId: normalized.externalId,
      status: "failed",
      error: safeRowError(validationError),
    };
  }
  const category = resolveCategory(normalized.category, context.categories)!;
  const { data, error } = await supabaseAdmin.rpc("create_listing_from_import_row", {
    _organization_id: context.organizationId,
    _user_id: context.userId,
    _import_id: importId,
    _external_id: normalized.externalId,
    _listing: {
      title: normalized.title,
      subtitle: normalized.subtitle ?? "",
      description: normalized.description,
      category_id: category.id,
      condition: normalized.condition ?? "",
      is_free: false,
      price_nok: normalized.priceNok,
      postal_code: context.location.postal_code ?? "",
      city: context.location.city ?? "",
      lat: context.location.lat,
      lng: context.location.lng,
      can_ship: normalized.canShip ?? null,
      known_issues: normalized.knownIssues ?? "",
      no_known_issues: normalized.noKnownIssues ?? false,
      maintenance_history: normalized.maintenanceHistory ?? "",
      attributes: normalized.attributes,
    },
  });
  if (error) throw error;
  const result = (data ?? {}) as { status?: string; listing_id?: string; error?: string };
  if (result.status === "created" && result.listing_id) {
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("kaupet_code")
      .eq("id", result.listing_id)
      .maybeSingle();
    if (listingError) throw listingError;
    return {
      rowNumber: row.rowNumber,
      externalId: normalized.externalId,
      status: "created",
      listingId: result.listing_id,
      kaupetCode: listing?.kaupet_code,
    };
  }
  if (result.status === "duplicate") {
    let kaupetCode: string | undefined;
    if (result.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select("kaupet_code")
        .eq("id", result.listing_id)
        .maybeSingle();
      kaupetCode = listing?.kaupet_code;
    }
    return {
      rowNumber: row.rowNumber,
      externalId: normalized.externalId,
      status: "duplicate",
      listingId: result.listing_id,
      kaupetCode,
    };
  }
  return {
    rowNumber: row.rowNumber,
    externalId: normalized.externalId,
    status: "failed",
    error: result.error ?? "Annonsen kunne ikke opprettes. Kontroller feltene.",
  };
}

export const createListingsFromImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        importId: z.string().uuid(),
        rows: z.array(z.unknown()).min(1).max(MAX_IMPORT_ROWS),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const importContext = await loadImportContext(supabaseAdmin, context.userId);
    const rows = data.rows.map((value, index) => {
      const row = value as Partial<BulkImportRow>;
      return {
        ...row,
        rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : index + 2,
      } as BulkImportRow;
    });
    const results: BulkImportResult[] = [];
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (row) => {
          try {
            return await createRow(supabaseAdmin, importContext, data.importId, row);
          } catch {
            return {
              rowNumber: row.rowNumber,
              externalId: String(row.externalId ?? ""),
              status: "failed" as const,
              error: "Annonsen kunne ikke opprettes. Prøv igjen senere.",
            };
          }
        }),
      );
      results.push(...batchResults);
    }
    return results;
  });
