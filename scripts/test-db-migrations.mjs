import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Spiller av engangsmigrasjoner mot eldre data i transaksjoner som rulles tilbake.

// Supabase CLI mounts test files, but not sibling migrations. Inline the actual
// migration so the regression tests its SQL rather than a separately maintained copy.
const directory = mkdtempSync(join(tmpdir(), "kaupet-migration-test-"));
try {
  const migration = readFileSync(
    "supabase/migrations/20261013170000_search_facets_numeric_and_category_move.sql",
    "utf8",
  );
  const template = readFileSync("supabase/tests/numeric_attribute_cleanup.sql.in", "utf8");
  const numericPath = join(directory, "numeric_attribute_cleanup.sql");
  writeFileSync(
    numericPath,
    template.replace("-- APPLY_NUMERIC_ATTRIBUTE_MIGRATION", () => migration),
  );

  const previousMigration = readFileSync(
    "supabase/migrations/20261012101000_isolate_saved_search_and_wtb_match_errors.sql",
    "utf8",
  );
  const validatorStart = previousMigration.indexOf(
    "CREATE FUNCTION public.saved_search_criteria_is_valid",
  );
  if (validatorStart < 0) throw new Error("Fant ikke den historiske saved-search-validatoren");
  const previousValidator = previousMigration
    .slice(validatorStart, previousMigration.indexOf("$$;", validatorStart) + 3)
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  const upgrade = [
    "20261013155000_prepare_saved_search_criteria_cleanup.sql",
    "20261013160000_saved_search_extra_groups.sql",
    "20261013165000_restore_saved_search_criteria_check.sql",
  ]
    .map((name) => readFileSync(join("supabase/migrations", name), "utf8"))
    .join("\n");
  const savedSearchPath = join(directory, "saved_search_criteria_upgrade.sql");
  writeFileSync(
    savedSearchPath,
    readFileSync("supabase/tests/saved_search_criteria_upgrade.sql.in", "utf8")
      .replace("-- RESTORE_PREVIOUS_SAVED_SEARCH_VALIDATOR", () => previousValidator)
      .replace("-- APPLY_SAVED_SEARCH_UPGRADE_MIGRATIONS", () => upgrade),
  );
  const euControlPath = join(directory, "eu_control_compatibility.sql");
  writeFileSync(
    euControlPath,
    readFileSync("supabase/tests/eu_control_compatibility.sql.in", "utf8")
      .replace("-- APPLY_EU_STATUS_MIGRATION", () =>
        readFileSync("supabase/migrations/20261015140000_eu_control_status.sql", "utf8"),
      )
      .replace("-- APPLY_EU_COMPAT_MIGRATION", () =>
        readFileSync("supabase/migrations/20261016001000_preserve_legacy_eu_control.sql", "utf8"),
      )
      .replace("-- APPLY_EU_CLEAR_MIGRATION", () =>
        readFileSync(
          "supabase/migrations/20261016140000_clear_legacy_wtb_eu_exemption.sql",
          "utf8",
        ),
      ),
  );
  const result = spawnSync(
    "bunx",
    ["supabase", "test", "db", directory, ...process.argv.slice(2)],
    {
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
