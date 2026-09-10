/**
 * Gjesteflyten: en utlogget bruker skal kunne fylle ut hele wizarden og bli
 * sendt til innlogging med utkastet lagret, i stedet for å møte en
 * serverfeil. Dekker at /ny-annonse ikke lenger ligger bak _authenticated,
 * og at auth-sjekken kommer før forhåndsvisnings-dialogen (se publishGate).
 *
 * Publiserer bevisst ingenting — den golden pathen eies av
 * publish-listing.spec.ts.
 */
import { expect, test } from "./fixtures";
import {
  clickNextAndWaitFor,
  fillDescriptionAndAdvance,
  goToNewListing,
  wizardStep,
} from "./pages/listing-wizard";

// Samme testeide kategori som publish-listing.spec.ts — se kommentaren der.
const TEST_CATEGORY_NAME = "E2E-test (ikke bruk)";

test("utlogget bruker sendes til innlogging med utkastet i behold", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-web",
    "Native publiseringsknapp har ingen egen testid",
  );

  await goToNewListing(page);

  const categorySearch = page.getByTestId("category-search-input");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill(TEST_CATEGORY_NAME);
  const categoryTile = page.locator(`[data-category-name="${TEST_CATEGORY_NAME}"]`);
  await categoryTile.click();
  await categoryTile.waitFor({ state: "detached" });

  await wizardStep(page, "photos").waitFor();
  await page.getByTestId("listing-title-input").fill("E2E gjesteannonse");

  await clickNextAndWaitFor(page, page.getByTestId("continue-without-image-button"), testInfo);
  await page.getByTestId("continue-without-image-button").click();

  await fillDescriptionAndAdvance(page, testInfo, "Automatisk opprettet av en e2e-test.");

  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();
  await page.getByRole("radio", { name: /Må hentes/ }).click();
  await clickNextAndWaitFor(page, wizardStep(page, "review-publish"), testInfo);

  const publishButton = page.getByTestId("publish-listing-button");
  await expect(publishButton).toHaveText(/Logg inn og publiser/);

  // Ingen forhåndsvisning er åpnet. Auth-sjekken må komme før
  // "Publiser likevel"-dialogen, ellers treffer gjesten publiseringskallet
  // og får "Du må være logget inn." i stedet for innloggingssiden.
  await publishButton.click();
  await expect(page).toHaveURL(/\/auth\?/, { timeout: 10_000 });
  await expect(page).toHaveURL(/returnTo=[^&]*resume%3Dauth-publish/);
  await expect(page.getByTestId("publish-anyway-button")).toHaveCount(0);

  // Utkastet må ha overlevd navigasjonen, ellers er gjenopptakelsen tom.
  const draft = await page.evaluate(() => localStorage.getItem("kaupet_draft_ny_annonse"));
  expect(draft).toContain("E2E gjesteannonse");
});
