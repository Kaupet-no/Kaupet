import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationDir = "supabase/migrations";
const tables = new Set();
for (const file of readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  const sql = readFileSync(join(migrationDir, file), "utf8");
  for (const [, operation, name] of sql.matchAll(
    /^\s*(CREATE|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+public\.([a-z][a-z0-9_]*)\b/gim,
  )) {
    if (operation.toUpperCase() === "CREATE") tables.add(name.toLowerCase());
    else tables.delete(name.toLowerCase());
  }
}

const rlsTests = readFileSync("src/lib/rls.integration.test.ts", "utf8");
const referenced = new Set(
  [...rlsTests.matchAll(/\.from\(\s*["']([a-z][a-z0-9_]*)["']\s*\)/g)].map((match) => match[1]),
);
// Existing gaps stay visible. New tables must get an RLS case before CI passes.
const knownGaps = new Set(["listing_image_jobs", "organization_api_keys"]);
const missing = [...tables].filter((name) => !referenced.has(name)).sort();
const newGaps = missing.filter((name) => !knownGaps.has(name));
const staleGaps = [...knownGaps].filter((name) => !missing.includes(name));

console.log(
  `RLS-inventar: ${tables.size} aktive public-tabeller, ${missing.length} uten testreferanse.`,
);
if (missing.length) console.log(`Kjente gap: ${missing.join(", ")}`);
if (newGaps.length) console.error(`Nye tabeller uten RLS-test: ${newGaps.join(", ")}`);
if (staleGaps.length) console.error(`Fjern løste gap fra sjekken: ${staleGaps.join(", ")}`);
if (newGaps.length || staleGaps.length) process.exitCode = 1;
