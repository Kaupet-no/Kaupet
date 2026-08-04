// Staging -> produksjon-synk for kategori-data (kategorier, rekkefølge,
// ikon, farge, søkeeksempler, filtre, flows, filter-synonymer). Staging er
// den redigerbare kilden; disse server-funksjonene brukes kun av produksjons-
// admin-panelet (src/routes/_authenticated/admin/kategorier.tsx) for å vise
// synk-status og gjøre selve synken. Se supabase/migrations/20260804090000_
// category_sync_status.sql for skjema og RPC.
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
      "Staging-synk kan ikke kjøres fra staging selv — dette miljøet er allerede staging.",
    );
  }
}

async function fetchCategorySyncTables(client: SupabaseClient<Database>) {
  const [categories, categoryFilters, categoryFlows, filterSynonyms, siteSettings] =
    await Promise.all([
      client.from("categories").select("*"),
      client.from("category_filters").select("*"),
      client.from("category_flows").select("*"),
      client.from("filter_synonyms").select("*"),
      client.from("site_settings").select("default_search_examples").eq("id", true).single(),
    ]);
  if (categories.error) throw categories.error;
  if (categoryFilters.error) throw categoryFilters.error;
  if (categoryFlows.error) throw categoryFlows.error;
  if (filterSynonyms.error) throw filterSynonyms.error;
  if (siteSettings.error) throw siteSettings.error;

  return {
    categories: categories.data as CategoryRow[],
    categoryFilters: categoryFilters.data as CategoryFilterRow[],
    categoryFlows: categoryFlows.data as CategoryFlowRow[],
    filterSynonyms: filterSynonyms.data as FilterSynonymRow[],
    defaultSearchExamples: siteSettings.data.default_search_examples,
  };
}

function maxUpdatedAt(rows: { updated_at?: string | null }[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at;
  }
  return max;
}

export const getCategorySyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stagingAdmin } = await import("@/integrations/supabase/staging-client.server");

    const [staging, status] = await Promise.all([
      fetchCategorySyncTables(stagingAdmin),
      supabaseAdmin.from("category_sync_status").select("last_synced_at").eq("id", true).single(),
    ]);
    if (status.error) throw status.error;

    const stagingUpdatedAt =
      [
        maxUpdatedAt(staging.categories),
        maxUpdatedAt(staging.categoryFilters),
        maxUpdatedAt(staging.categoryFlows),
        maxUpdatedAt(staging.filterSynonyms),
      ]
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;

    const lastSyncedAt = status.data.last_synced_at;
    const inSync = !!lastSyncedAt && (!stagingUpdatedAt || stagingUpdatedAt <= lastSyncedAt);

    return { inSync, stagingUpdatedAt, lastSyncedAt };
  });

type DiffEntry<T> = { added: T[]; updated: { before: T; after: T }[]; removed: T[] };

function diffById<T extends { id: string }>(prodRows: T[], stagingRows: T[]): DiffEntry<T> {
  const prodById = new Map(prodRows.map((r) => [r.id, r]));
  const stagingById = new Map(stagingRows.map((r) => [r.id, r]));
  const added: T[] = [];
  const updated: { before: T; after: T }[] = [];
  for (const [id, after] of stagingById) {
    const before = prodById.get(id);
    if (!before) added.push(after);
    else if (JSON.stringify(before) !== JSON.stringify(after)) updated.push({ before, after });
  }
  const removed = prodRows.filter((r) => !stagingById.has(r.id));
  return { added, updated, removed };
}

export const getCategorySyncDiff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stagingAdmin } = await import("@/integrations/supabase/staging-client.server");

    const [staging, prod] = await Promise.all([
      fetchCategorySyncTables(stagingAdmin),
      fetchCategorySyncTables(supabaseAdmin),
    ]);

    return {
      categories: diffById(prod.categories, staging.categories),
      categoryFilters: diffById(prod.categoryFilters, staging.categoryFilters),
      categoryFlows: diffById(prod.categoryFlows, staging.categoryFlows),
      filterSynonyms: diffById(prod.filterSynonyms, staging.filterSynonyms),
      defaultSearchExamplesChanged:
        JSON.stringify(prod.defaultSearchExamples ?? []) !==
        JSON.stringify(staging.defaultSearchExamples ?? []),
      staging,
    };
  });

export const syncCategoriesFromStaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    assertProductionEnvironment();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    if (error) throw error;

    return { ok: true };
  });
