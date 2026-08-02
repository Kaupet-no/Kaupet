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
  // Search directly for the known simple leaf above rather than drilling
  // blind. Search matches across every level, so no drill-down is needed.
  // Tiles carry a stable data-category-name attribute (see
  // category-picker.tsx) instead of relying on the tile's accessible text,
  // which is prefixed with a breadcrumb in search results (e.g. "Barn og
  // baby / Møbler til barnerom / Stellebord og oppbevaring").
  const categorySearch = page.getByTestId("category-search-input");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill(TEST_CATEGORY_NAME);
  await page.locator(`[data-category-name="${TEST_CATEGORY_NAME}"]`).click();
  // Picker shows a checkmark confirmation for SELECTION_CONFIRM_MS before
  // firing onSelect and advancing to the next step.
  await page.waitForTimeout(500);

  // Tittel, Kategori (already set), Tilstand and Pris all live on the same
  // "Bilder & tittel" step. The test category has no attributes, so there's
  // nothing else to fill in here.
  await page.getByTestId("listing-title-input").fill("E2E testannonse — Stokke Tripp Trapp");
  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  // Beskrivelse, delivery/location and the publish confirmation are each
  // their own subsequent step. Walk forward generically: fill Beskrivelse
  // when its step is showing, dismiss the "no images added" confirmation
  // dialog the first "Neste" click triggers, and stop once "Publiser
  // annonse" appears.
  for (let i = 0; i < 5; i++) {
    const publishButton = page.getByTestId("publish-listing-button");
    if (await publishButton.isVisible().catch(() => false)) break;

    const descriptionField = page.getByTestId("listing-description-textarea");
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill(
        "Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.",
      );
    }

    await page.getByTestId("wizard-next-button").click();

    const continueWithoutImage = page.getByTestId("continue-without-image-button");
    if (await continueWithoutImage.isVisible().catch(() => false)) {
      await continueWithoutImage.click();
    }
  }

  await page.getByTestId("publish-listing-button").click();
  // Publishing without having opened the preview first prompts a "want to
  // preview before publishing?" dialog rather than publishing immediately.
  await page.getByTestId("publish-anyway-button").click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
});
