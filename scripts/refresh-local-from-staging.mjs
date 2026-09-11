#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const LOCAL_ENV_FILE = ".env";
const STAGING_ENV_FILE = ".env.staging.local";
const LOCAL_ONLY_EMAIL = "dev-seller@local.kaupet.test";
const DELETE_BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

function parseDotenv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function required(env, key, file) {
  const value = env[key];
  if (!value) throw new Error(`${key} mangler i ${file}`);
  return value;
}

function assertEndpoints(localUrl, stagingUrl) {
  const localHost = new URL(localUrl).hostname;
  const stagingHost = new URL(stagingUrl).hostname;
  if (!new Set(["127.0.0.1", "localhost"]).has(localHost)) {
    throw new Error(`Nekter å skrive til ikke-lokal Supabase: ${localUrl}`);
  }
  if (new Set(["127.0.0.1", "localhost"]).has(stagingHost)) {
    throw new Error(`Staging-endepunktet peker lokalt: ${stagingUrl}`);
  }
}

async function unwrap(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function readAll(client, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await unwrap(
      client
        .from(table)
        .select("*")
        .range(offset, offset + PAGE_SIZE - 1),
      `Les ${table}`,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function upsertInBatches(client, table, rows, onConflict = "id") {
  for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
    await unwrap(
      client.from(table).upsert(rows.slice(offset, offset + PAGE_SIZE), { onConflict }),
      `Skriv ${table}`,
    );
  }
}

async function clearByKey(client, table, key) {
  const rows = await unwrap(client.from(table).select(key), `Finn rader i ${table}`);
  for (let offset = 0; offset < rows.length; offset += DELETE_BATCH_SIZE) {
    const values = rows.slice(offset, offset + DELETE_BATCH_SIZE).map((row) => row[key]);
    await unwrap(client.from(table).delete().in(key, values), `Tøm ${table}`);
  }
}

async function clearLocalData(local) {
  // Listings must go first: related rows and category references depend on them.
  await clearByKey(local, "listings", "id");
  await clearByKey(local, "listing_category_word_stats", "category_id");
  await clearByKey(local, "listing_keyword_stats", "category_id");
  await clearByKey(local, "vehicle_models", "id");
  await clearByKey(local, "vehicle_model_classes", "id");
  await clearByKey(local, "vehicle_brands", "id");
  await clearByKey(local, "filter_synonyms", "id");
  await clearByKey(local, "category_filters", "id");
  await clearByKey(local, "category_flows", "id");
  await clearByKey(local, "categories", "id");
  await unwrap(local.from("site_settings").delete().eq("id", true), "Tøm site_settings");
}

async function listStorageFiles(client, bucket, prefix = "") {
  const entries = await unwrap(
    client.storage.from(bucket).list(prefix, { limit: PAGE_SIZE, offset: 0 }),
    `List filer i ${bucket}/${prefix}`,
  );
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) files.push(...(await listStorageFiles(client, bucket, path)));
    else files.push(path);
  }
  return files;
}

async function clearListingStorage(local) {
  const files = await listStorageFiles(local, "listing-images");
  for (let offset = 0; offset < files.length; offset += 100) {
    await unwrap(
      local.storage.from("listing-images").remove(files.slice(offset, offset + 100)),
      "Tøm listing-images",
    );
  }
}

async function ensureLocalOwner(local) {
  const users = await unwrap(
    local.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    "Les lokale brukere",
  );
  let user = users.users.find((candidate) => candidate.email === LOCAL_ONLY_EMAIL);
  if (!user) {
    const created = await unwrap(
      local.auth.admin.createUser({
        email: LOCAL_ONLY_EMAIL,
        password: `local-${crypto.randomUUID()}-not-for-production`,
        email_confirm: true,
        user_metadata: { display_name: "Dev-selger" },
      }),
      "Opprett lokal dev-bruker",
    );
    user = created.user;
  }
  if (!user) throw new Error("Kunne ikke opprette eller finne lokal dev-bruker");

  await upsertInBatches(local, "profiles", [
    { id: user.id, display_name: "Dev-selger", avatar_url: null, deleted_at: null },
  ]);
  return user.id;
}

function categoriesInParentOrder(rows) {
  const pending = new Map(rows.map((row) => [row.id, row]));
  const ordered = [];
  while (pending.size > 0) {
    const ready = [...pending.values()].filter(
      (row) => row.parent_id === null || !pending.has(row.parent_id),
    );
    if (ready.length === 0) throw new Error("Kategoriene har en ugyldig foreldresyklus");
    for (const row of ready) {
      ordered.push(row);
      pending.delete(row.id);
    }
  }
  return ordered;
}

function listingForLocal(row, ownerId) {
  return {
    id: row.id,
    seller_id: ownerId,
    title: row.title,
    description: row.description,
    price_nok: row.price_nok,
    is_free: row.is_free || row.price_nok === null,
    category_id: row.category_id,
    condition: row.condition,
    postal_code: row.postal_code,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    status: "active",
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: null,
    expires_at: null,
    kaupet_code: row.kaupet_code,
    display_lat: row.display_lat,
    display_lng: row.display_lng,
    can_ship: row.can_ship,
    attributes: row.attributes,
    subtitle: row.subtitle,
    known_issues: row.known_issues,
    no_known_issues: row.no_known_issues,
    maintenance_history: row.maintenance_history,
    hidden_from_home: row.hidden_from_home,
    organization_id: null,
    organization_location_id: null,
    show_visiting_address: false,
  };
}

function contentType(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    }[extension] ?? "application/octet-stream"
  );
}

async function copyListingImages(source, local, rows) {
  const copiedPaths = new Set();
  for (const row of rows) {
    const { data: file, error: downloadError } = await source.storage
      .from("listing-images")
      .download(row.storage_path);
    if (downloadError || !file) {
      console.warn(`  Hopper over manglende bilde: ${row.storage_path}`);
      continue;
    }
    await unwrap(
      local.storage.from("listing-images").upload(row.storage_path, file, {
        contentType: contentType(row.storage_path),
        upsert: true,
      }),
      `Skriv bilde ${row.storage_path}`,
    );
    copiedPaths.add(row.storage_path);
  }
  return rows.filter((row) => copiedPaths.has(row.storage_path));
}

async function main() {
  if (!process.argv.includes("--replace")) {
    console.error(
      "Dette erstatter lokale listings, katalogdata og listing-images. Kjør med --replace.",
    );
    process.exitCode = 2;
    return;
  }

  const localEnv = parseDotenv(LOCAL_ENV_FILE);
  const stagingEnv = parseDotenv(STAGING_ENV_FILE);
  const localUrl = required(localEnv, "SUPABASE_URL", LOCAL_ENV_FILE);
  const localKey = required(localEnv, "SUPABASE_SERVICE_ROLE_KEY", LOCAL_ENV_FILE);
  const stagingUrl = required(stagingEnv, "SUPABASE_URL", STAGING_ENV_FILE);
  const stagingKey = required(stagingEnv, "SUPABASE_SERVICE_ROLE_KEY", STAGING_ENV_FILE);
  assertEndpoints(localUrl, stagingUrl);

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const source = createClient(stagingUrl, stagingKey, options);
  const local = createClient(localUrl, localKey, options);

  console.log("Leser staging-data …");
  const [
    categories,
    filters,
    flows,
    synonyms,
    brands,
    models,
    modelClasses,
    settings,
    listings,
    images,
    viewTotals,
  ] = await Promise.all([
    readAll(source, "categories"),
    readAll(source, "category_filters"),
    readAll(source, "category_flows"),
    readAll(source, "filter_synonyms"),
    readAll(source, "vehicle_brands"),
    readAll(source, "vehicle_models"),
    readAll(source, "vehicle_model_classes"),
    readAll(source, "site_settings"),
    readAll(source, "listings"),
    readAll(source, "listing_images"),
    readAll(source, "listing_view_totals"),
  ]);

  console.log(
    `Fant ${categories.length} kategorier, ${listings.length} annonser og ${images.length} annonsebilder.`,
  );
  console.log("Tømmer valgt lokal dev-data …");
  await clearLocalData(local);
  await clearListingStorage(local);

  console.log("Skriver katalogdata …");
  await upsertInBatches(local, "categories", categoriesInParentOrder(categories));
  await upsertInBatches(local, "category_filters", filters);
  await upsertInBatches(local, "category_flows", flows);
  // category_filters generates its own synonyms; only import hand-curated rows.
  await upsertInBatches(
    local,
    "filter_synonyms",
    synonyms.filter((row) => !row.is_generated),
  );
  await upsertInBatches(
    local,
    "vehicle_brands",
    brands.map((row) => ({ ...row, submitted_by: null })),
  );
  await upsertInBatches(
    local,
    "vehicle_model_classes",
    modelClasses.map((row) => ({ ...row, submitted_by: null })),
  );
  await upsertInBatches(
    local,
    "vehicle_models",
    models.map((row) => ({ ...row, submitted_by: null })),
  );
  await upsertInBatches(local, "site_settings", settings);

  const ownerId = await ensureLocalOwner(local);
  const localListings = listings.map((row) => listingForLocal(row, ownerId));
  console.log("Skriver annonser som aktive lokale dev-annonser …");
  await upsertInBatches(local, "listings", localListings);
  await upsertInBatches(local, "listing_view_totals", viewTotals, "listing_id");

  console.log("Kopierer annonsebilder …");
  const localImages = await copyListingImages(source, local, images);
  await upsertInBatches(local, "listing_images", localImages);

  console.log(
    `Ferdig: ${categories.length} kategorier, ${localListings.length} aktive annonser og ${localImages.length} annonsebilder lokalt.`,
  );
}

main().catch((error) => {
  console.error(`Import feilet: ${error.message}`);
  process.exitCode = 1;
});
