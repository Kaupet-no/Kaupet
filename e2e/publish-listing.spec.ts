/**
 * Golden-path e2e test: log in and publish a listing.
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const { email, password } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { email: string; password: string };

// Dedicated e2e-only category (see the
// 20260802210000_e2e_test_category.sql migration) — a root-level leaf with
// zero category_filters rows, so the wizard needs no attribute inputs
// filled in to advance past the category-select step. Using a real
// production category here (as earlier versions of this test did) meant
// the test broke whenever that category's attributes changed in admin;
// this one is owned by the test suite. Never rename/delete its slug
// ('e2e-test-listing') without updating this file.
const TEST_CATEGORY_NAME = "E2E-test (ikke bruk)";

test("logger inn og publiserer en annonse", async ({ page }) => {
  await page.goto("/auth");
  // Inputs are controlled (SSR-rendered, then hydrated) — filling before
  // hydration finishes gets clobbered when React reconciles to its initial
  // empty state, so wait for the network to settle first.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord").fill(password);
  await expect(page.getByLabel("E-post")).toHaveValue(email);
  await page.getByRole("main").getByRole("button", { name: "Logg inn" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });

  // type=sell is required — without it the route redirects to "/" (entry
  // is meant to go through the "Opprett en annonse" picker dialog, which
  // sets this param before navigating here).
  await page.goto("/ny-annonse?type=sell");

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
  await page.getByTestId("wizard-step-title-photos").waitFor();
  await page.getByTestId("listing-title-input").fill("E2E testannonse — Stokke Tripp Trapp");
  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  // No images were added, so the first "Neste" click prompts a "no images"
  // confirmation dialog instead of advancing directly.
  await page.getByTestId("wizard-next-button").click();
  await page.getByTestId("continue-without-image-button").click();

  // Beskrivelse is its own step.
  await page.getByTestId("wizard-step-description-keywords").waitFor();
  await page
    .getByTestId("listing-description-textarea")
    .fill("Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.");
  await page.getByTestId("wizard-next-button").click();

  // Final step: delivery/location + publish confirmation share one page.
  await page.getByTestId("wizard-step-delivery-location").waitFor();
  await page.getByTestId("publish-listing-button").click();
  // Publishing without having opened the preview first prompts a "want to
  // preview before publishing?" dialog rather than publishing immediately.
  await page.getByTestId("publish-anyway-button").click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
});
