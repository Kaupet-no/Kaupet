/**
 * Golden-path e2e test: log in and publish a listing.
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
  clickNextAndWaitFor,
  fillDescriptionAndAdvance,
  goToNewListing,
  login,
  publishAndExpectSuccess,
  wizardStep,
} from "./pages/listing-wizard";

const { users } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { users: Record<string, { email: string; password: string }> };

// Dedicated e2e-only category (see the
// 20260802210000_e2e_test_category.sql migration) — a root-level leaf with
// zero category_filters rows, so the wizard needs no attribute inputs
// filled in to advance past the category-select step. Using a real
// production category here (as earlier versions of this test did) meant
// the test broke whenever that category's attributes changed in admin;
// this one is owned by the test suite. Never rename/delete its slug
// ('e2e-test-listing') without updating this file.
const TEST_CATEGORY_NAME = "E2E-test (ikke bruk)";

test("logger inn og publiserer en annonse", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);
  const { email, password } = credentials;
  await login(page, email, password);
  await goToNewListing(page);

  // Category must be chosen first — it's always the wizard's first step.
  // Search directly for the test category above rather than drilling
  // blind. Search matches across every level, so no drill-down is needed.
  // Tiles carry a stable data-category-name attribute (see
  // category-picker.tsx) instead of relying on the tile's accessible text,
  // which is prefixed with a breadcrumb in search results.
  const categorySearch = page.getByTestId("category-search-input");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill(TEST_CATEGORY_NAME);
  const categoryTile = page.locator(`[data-category-name="${TEST_CATEGORY_NAME}"]`);
  await categoryTile.click();
  // No fixed delay: picking a leaf category unmounts the whole
  // category-select step (after its own internal SELECTION_CONFIRM_MS
  // checkmark delay), so waiting for the clicked tile to detach from the
  // DOM is a direct signal that the wizard has moved on — no guessing at
  // how long that takes.
  await categoryTile.waitFor({ state: "detached" });

  // Tittel, Kategori (already set), Tilstand and Pris all live on the same
  // "Bilder & tittel" step. The test category has no attributes, so there's
  // nothing else to fill in here.
  await wizardStep(page, "title-photos").waitFor();
  await page.getByTestId("listing-title-input").fill("E2E testannonse — Stokke Tripp Trapp");
  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  // No images were added, so the first "Neste" click prompts a "no images"
  // confirmation dialog instead of advancing directly.
  await clickNextAndWaitFor(page, page.getByTestId("continue-without-image-button"), testInfo);
  await page.getByTestId("continue-without-image-button").click();

  await fillDescriptionAndAdvance(
    page,
    testInfo,
    "Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.",
  );

  await publishAndExpectSuccess(page, testInfo);
});
