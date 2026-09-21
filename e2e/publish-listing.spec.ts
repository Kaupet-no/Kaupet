/**
 * Golden-path e2e test: log in and publish a listing.
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import {
  chooseCategory,
  clickNextAndWaitFor,
  fillDescriptionAndAdvance,
  fixMissingInformation,
  goToNewListing,
  login,
  missingInformationDialog,
  openPublishingStatus,
  publishAndExpectSuccess,
  publishingStatusButton,
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
  await chooseCategory(page, TEST_CATEGORY_NAME);

  // The title is part of the "Vis frem" task; condition, price, delivery and
  // location are grouped into the later "Gjør handelen enkel" task.
  await wizardStep(page, "photos").waitFor();
  await page.getByTestId("listing-title-input").fill("E2E testannonse — Stokke Tripp Trapp");

  // No images were added, so the first "Neste" click prompts a "no images"
  // confirmation dialog instead of advancing directly.
  await clickNextAndWaitFor(page, page.getByTestId("continue-without-image-button"), testInfo);
  await page.getByTestId("continue-without-image-button").click();

  await fillDescriptionAndAdvance(
    page,
    testInfo,
    "Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.",
  );

  // "Gis bort gratis" now belongs to the "Gjør handelen enkel" task, not
  // "Vis frem". Selecting it satisfies the optional-price validation without
  // changing the publish contract this golden path proves.
  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();
  // Delivery method is required for every non-vehicle, non-boat category
  // (see requiresDeliveryMethod in category-behavior.ts) and createListing
  // rejects can_ship: null server-side — but the wizard's own
  // "requiredToPublish" check for the delivery field group doesn't catch a
  // missing selection, so skipping this silently reaches "Publiseringsklar"
  // and only fails once the publish click hits the server.
  await page.getByRole("radio", { name: /Må hentes/ }).click();
  await clickNextAndWaitFor(page, wizardStep(page, "review-publish"), testInfo);

  await publishAndExpectSuccess(page, testInfo);
});

test("viser manglende opplysninger med snarvei til feltet", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-web",
    "Publiseringsstatus ligger i desktop-sidepanelet",
  );
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewListing(page);
  // Publiseringsstatus rendres bak `categoryId &&` (ui-gjennomgangen, W2):
  // antallet manglende opplysninger avhenger av kategorien, så panelet finnes
  // ikke før en kategori er valgt. Tittelen fylles derfor på photos-steget
  // i stedet for via ?title=, slik at den ikke teller som en mangel her.
  await chooseCategory(page, TEST_CATEGORY_NAME);
  await wizardStep(page, "photos").waitFor();
  await page.getByTestId("listing-title-input").fill("E2E statusannonse");
  await publishingStatusButton(page).waitFor();

  await expect(publishingStatusButton(page)).toContainText(/opplysninger? mangler/);
  await openPublishingStatus(page);
  const dialog = missingInformationDialog(page);
  await expect(dialog.getByText("Beskrivelse", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Pris", { exact: true })).toBeVisible();

  await fixMissingInformation(page, "Beskrivelse");
  await expect(page.getByTestId("listing-description-textarea")).toBeFocused();
});
