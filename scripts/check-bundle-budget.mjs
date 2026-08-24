import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CLIENT_DIR = path.resolve("dist/client");
const SERVER_DIR = path.resolve("dist/server");
const JS_LIMIT = 450 * 1024;
const CSS_LIMIT = 180 * 1024;
// Route totals include each route's preloads plus the root preloads, de-duplicated.
const ROUTE_LIMITS = {
  "/": 1_750 * 1024,
  "/annonser": 1_750 * 1024,
};

function fail(message) {
  throw new Error(`Bundlebudsjett: ${message}`);
}

function assertDirectory(directory, label) {
  if (!existsSync(directory)) fail(`mangler ${label}-katalogen ${directory}`);
}

function findManifest() {
  assertDirectory(SERVER_DIR, "server");
  const manifests = readdirSync(SERVER_DIR)
    .filter((file) => /^_tanstack-start-manifest_.+\.(?:mjs|js)$/.test(file))
    .sort();
  if (manifests.length === 0) fail(`fant ingen generert TanStack-manifest i ${SERVER_DIR}`);
  if (manifests.length > 1) {
    fail(`fant flere genererte TanStack-manifester i ${SERVER_DIR}: ${manifests.join(", ")}`);
  }
  return path.join(SERVER_DIR, manifests[0]);
}

async function readManifest() {
  const manifestPath = findManifest();
  let manifestModule;
  try {
    manifestModule = await import(pathToFileURL(manifestPath).href);
  } catch (error) {
    fail(`klarte ikke å lese ${manifestPath}: ${error.message}`);
  }
  if (typeof manifestModule.tsrStartManifest !== "function") {
    fail(`${manifestPath} eksporterer ikke tsrStartManifest()`);
  }
  const manifest = manifestModule.tsrStartManifest();
  if (!manifest?.routes || typeof manifest.routes !== "object") {
    fail(`${manifestPath} mangler routes`);
  }
  return manifest.routes;
}

function routeAssets(route, routes) {
  const rootPreloads = routes.__root__?.preloads;
  const routePreloads = routes[route]?.preloads;
  if (!Array.isArray(rootPreloads)) fail(`manifestet mangler __root__.preloads for ${route}`);
  if (!Array.isArray(routePreloads)) fail(`manifestet mangler ${route}.preloads`);

  const links = [...new Set([...rootPreloads, ...routePreloads])];
  if (links.length === 0) fail(`manifestet har ingen preloads for ${route}`);

  return links.map((link) => {
    if (typeof link !== "string" || !link.startsWith("/assets/")) {
      fail(`ugyldig preload for ${route}: ${String(link)}`);
    }
    const file = path.resolve(CLIENT_DIR, link.slice(1));
    if (path.relative(CLIENT_DIR, file).startsWith("..")) {
      fail(`preload peker utenfor klientkatalogen for ${route}: ${link}`);
    }
    if (!existsSync(file)) fail(`mangler preload-asset for ${route}: ${link}`);
    return { file, link };
  });
}

function assertRouteBudget(route, routes) {
  const assets = routeAssets(route, routes);
  const bytes = assets.reduce((total, { file }) => total + statSync(file).size, 0);
  const limit = ROUTE_LIMITS[route];
  console.log(
    `Route ${route}: ${assets.length} unike preload-assets (${(bytes / 1024).toFixed(1)} KiB / ${limit / 1024} KiB)`,
  );
  if (bytes > limit) {
    fail(`${route} overskrider ${limit / 1024} KiB (${(bytes / 1024).toFixed(1)} KiB)`);
  }
}


function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

function assertBudget(label, files, limit) {
  const measured = files
    .map((file) => ({ file, bytes: statSync(file).size }))
    .sort((a, b) => b.bytes - a.bytes);
  const largest = measured[0];
  if (!largest) return;

  const relative = path.relative(CLIENT_DIR, largest.file);
  console.log(
    `${label}: ${relative} (${(largest.bytes / 1024).toFixed(1)} KiB / ${limit / 1024} KiB)`,
  );
  if (largest.bytes > limit) {
    throw new Error(`${label}-budsjettet er overskredet av ${relative}`);
  }

  if (label === "Største JavaScript-fil") {
    console.log("Fem største JavaScript-filer:");
    for (const { file, bytes } of measured.slice(0, 5)) {
      console.log(`  ${path.relative(CLIENT_DIR, file)} (${(bytes / 1024).toFixed(1)} KiB)`);
    }
  }
}

assertDirectory(CLIENT_DIR, "client");
const files = walk(CLIENT_DIR);
assertBudget(
  "Største JavaScript-fil",
  files.filter((file) => /\.(?:js|mjs)$/.test(file)),
  JS_LIMIT,
);
assertBudget(
  "Største CSS-fil",
  files.filter((file) => file.endsWith(".css")),
  CSS_LIMIT,
);
const routes = await readManifest();
for (const route of Object.keys(ROUTE_LIMITS)) {
  assertRouteBudget(route, routes);
}
