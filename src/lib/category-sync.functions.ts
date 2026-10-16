// Staging -> produksjon-synk for kategori-data (kategorier, rekkefølge,
// ikon, farge, søkeeksempler, filtre, flows, filter-synonymer). Staging er
// den redigerbare kilden; disse server-funksjonene brukes kun av produksjons-
// admin-panelet (src/routes/_authenticated/admin/kategorier.tsx) for å vise
// synk-status og gjøre selve synken. Se supabase/migrations/20260804090000_
// category_sync_status.sql for skjema og RPC.
import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole as requireAdmin } from "@/lib/admin-auth.server";
import type { Database, Tables } from "@/integrations/supabase/types";

type CategoryRow = Tables<"categories">;
type CategoryFilterRow = Tables<"category_filters">;
type CategoryFlowRow = Tables<"category_flows">;
type FilterSynonymRow = Tables<"filter_synonyms">;

function assertProductionEnvironment() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_URL === process.env.STAGING_SUPABASE_URL) {
    throw new Error(
      // eslint-disable-next-line no-restricted-syntax -- miljøvakt for admin-verktøy, ikke en brukerfeil
      "Staging-synk kan ikke kjøres fra staging selv — dette miljøet er allerede staging.",
    );
  }
}

/** Hele kildegrunnlaget fra ett konsistent snapshot (én SQL-setning), så
 * en endring under hentingen ikke kan gi et blandet grunnlag som synken
 * sletter produksjonsrader etter (KG-06-F02). */
async function fetchCategorySyncTables(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc("category_sync_snapshot");
  if (error) throw await toClientError("database", error);
  const snapshot = data as {
    categories: CategoryRow[];
    category_filters: CategoryFilterRow[];
    category_flows: CategoryFlowRow[];
    filter_synonyms: FilterSynonymRow[];
    default_search_examples: Tables<"site_settings">["default_search_examples"];
  };
  return {
    categories: snapshot.categories,
    categoryFilters: snapshot.category_filters,
    categoryFlows: snapshot.category_flows,
    filterSynonyms: snapshot.filter_synonyms,
    defaultSearchExamples: snapshot.default_search_examples,
  };
}

type CategorySyncTables = Awaited<ReturnType<typeof fetchCategorySyncTables>>;

export const getCategorySyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { stagingAdmin } = await import("@/integrations/supabase/staging-client.server");

    const [staging, prod, status] = await Promise.all([
      fetchCategorySyncTables(stagingAdmin),
      fetchCategorySyncTables(supabaseAdmin),
      supabaseAdmin.from("category_sync_status").select("last_synced_at").eq("id", true).single(),
    ]);
    if (status.error) {
      throw await toClientError("database", status.error);
    }

    // Ajour betyr likt innhold. Tidsstempler ser ikke slettinger (KG-06-F02).
    const diff = diffCategorySync(staging, prod);
    const inSync =
      !diff.defaultSearchExamplesChanged &&
      [diff.categories, diff.categoryFilters, diff.categoryFlows, diff.filterSynonyms].every(
        (d) => d.added.length + d.updated.length + d.removed.length === 0,
      );

    return { inSync, lastSyncedAt: status.data.last_synced_at };
  });

type DiffEntry<T> = { added: T[]; updated: { before: T; after: T }[]; removed: T[] };

// Staging og produksjon er to uavhengige Supabase-prosjekter: samme logiske
// kategori/filter/flow/synonym har ulik UUID i hvert miljø, så en id-basert
// diff ville feilaktig vist ALT som lagt til + slettet hver gang (se
// bugfix-migrasjonen 20260804100000). Match i stedet på en stabil "naturlig
// nøkkel" (slug, filter-nøkkel osv.), forhåndsbygget separat for hver side
// (nøklene er sammenlignbare på tvers av miljøer selv om radenes egne id-er
// ikke er det). "Endret" avgjøres via normalize, som utelater
// id/created_at/updated_at og andre miljø-spesifikke fremmednøkler.
function diffByKey<T>(
  prodByKey: Map<string, T>,
  stagingByKey: Map<string, T>,
  normalize: (r: T) => unknown,
): DiffEntry<T> {
  const added: T[] = [];
  const updated: { before: T; after: T }[] = [];
  for (const [key, after] of stagingByKey) {
    const before = prodByKey.get(key);
    if (!before) added.push(after);
    else if (JSON.stringify(normalize(before)) !== JSON.stringify(normalize(after)))
      updated.push({ before, after });
  }
  const removed = [...prodByKey.entries()]
    .filter(([key]) => !stagingByKey.has(key))
    .map(([, row]) => row);
  return { added, updated, removed };
}

function keyByCategorySlug(rows: CategoryRow[]): Map<string, CategoryRow> {
  return new Map(rows.map((r) => [r.slug, r]));
}

function keyByCategoryAndField<T extends { category_id: string }>(
  rows: T[],
  categoryIdToSlug: Map<string, string>,
  field: (r: T) => string,
): Map<string, T> {
  return new Map(
    rows.map((r) => [`${categoryIdToSlug.get(r.category_id) ?? r.category_id}::${field(r)}`, r]),
  );
}

function keyBySynonymIdentity(
  rows: FilterSynonymRow[],
  filterIdToKey: Map<string, string>,
): Map<string, FilterSynonymRow> {
  return new Map(
    rows.map((r) => [
      `${filterIdToKey.get(r.category_filter_id) ?? r.category_filter_id}::${r.option_value ?? ""}::${r.phrase}`,
      r,
    ]),
  );
}

/** Forelderen sammenlignes som slug, ikke miljøspesifikk UUID, så en
 * flytting alene gir en synkbar endring (KG-21-F02). */
function normalizeCategory(slugById: Map<string, string>) {
  return (c: CategoryRow) => ({
    ...c,
    id: undefined,
    parent_id: undefined,
    parent_slug: c.parent_id ? (slugById.get(c.parent_id) ?? c.parent_id) : null,
    created_at: undefined,
    updated_at: undefined,
  });
}

function normalizeCategoryFilter(f: CategoryFilterRow) {
  return {
    ...f,
    id: undefined,
    category_id: undefined,
    created_at: undefined,
    updated_at: undefined,
  };
}

function normalizeCategoryFlow(f: CategoryFlowRow) {
  return {
    ...f,
    id: undefined,
    category_id: undefined,
    created_at: undefined,
    updated_at: undefined,
  };
}

function normalizeFilterSynonym(s: FilterSynonymRow) {
  return {
    ...s,
    id: undefined,
    category_filter_id: undefined,
    created_at: undefined,
    updated_at: undefined,
  };
}

function diffCategorySync(staging: CategorySyncTables, prod: CategorySyncTables) {
  const stagingSlugById = new Map(staging.categories.map((c) => [c.id, c.slug]));
  const prodSlugById = new Map(prod.categories.map((c) => [c.id, c.slug]));

  const stagingFilterKeyById = new Map(
    staging.categoryFilters.map((f) => [
      f.id,
      `${stagingSlugById.get(f.category_id) ?? f.category_id}::${f.key}`,
    ]),
  );
  const prodFilterKeyById = new Map(
    prod.categoryFilters.map((f) => [
      f.id,
      `${prodSlugById.get(f.category_id) ?? f.category_id}::${f.key}`,
    ]),
  );

  return {
    categories: diffByKey(
      keyByCategorySlug(prod.categories),
      keyByCategorySlug(staging.categories),
      // UUID-ene er tilfeldige per miljø, så de to oppslagene kan slås sammen.
      normalizeCategory(new Map([...prodSlugById, ...stagingSlugById])),
    ),
    categoryFilters: diffByKey(
      keyByCategoryAndField(prod.categoryFilters, prodSlugById, (f) => f.key),
      keyByCategoryAndField(staging.categoryFilters, stagingSlugById, (f) => f.key),
      normalizeCategoryFilter,
    ),
    categoryFlows: diffByKey(
      keyByCategoryAndField(prod.categoryFlows, prodSlugById, () => ""),
      keyByCategoryAndField(staging.categoryFlows, stagingSlugById, () => ""),
      normalizeCategoryFlow,
    ),
    filterSynonyms: diffByKey(
      keyBySynonymIdentity(prod.filterSynonyms, prodFilterKeyById),
      keyBySynonymIdentity(staging.filterSynonyms, stagingFilterKeyById),
      normalizeFilterSynonym,
    ),
    defaultSearchExamplesChanged:
      JSON.stringify(prod.defaultSearchExamples ?? []) !==
      JSON.stringify(staging.defaultSearchExamples ?? []),
  };
}

export const getCategorySyncDiff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { stagingAdmin } = await import("@/integrations/supabase/staging-client.server");

    const [staging, prod] = await Promise.all([
      fetchCategorySyncTables(stagingAdmin),
      fetchCategorySyncTables(supabaseAdmin),
    ]);

    return { ...diffCategorySync(staging, prod), staging };
  });

export const syncCategoriesFromStaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    assertProductionEnvironment();
    const supabaseAdmin = await getSupabaseAdmin();
    const { stagingAdmin } = await import("@/integrations/supabase/staging-client.server");

    const staging = await fetchCategorySyncTables(stagingAdmin);

    const { error } = await supabaseAdmin.rpc("sync_categories_from_payload", {
      p_categories: staging.categories,
      p_category_filters: staging.categoryFilters,
      p_category_flows: staging.categoryFlows,
      p_filter_synonyms: staging.filterSynonyms,
      p_default_search_examples: staging.defaultSearchExamples ?? [],
      p_synced_by: context.userId,
    });
    if (error) {
      throw await toClientError("database", error);
    }

    return { ok: true };
  });
