import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Supabase CLI mounts test files, but not sibling migrations. Inline the actual
// migration so the regression tests its SQL rather than a separately maintained copy.
const directory = mkdtempSync(join(tmpdir(), "kaupet-migration-test-"));
try {
  const migration = readFileSync(
    "supabase/migrations/20261013170000_search_facets_numeric_and_category_move.sql",
    "utf8",
  );
  const template = readFileSync("supabase/tests/numeric_attribute_cleanup.sql.in", "utf8");
  const path = join(directory, "numeric_attribute_cleanup.sql");
  writeFileSync(
    path,
    template.replace("-- APPLY_NUMERIC_ATTRIBUTE_MIGRATION", () => migration),
  );
  const result = spawnSync("bunx", ["supabase", "test", "db", path, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
