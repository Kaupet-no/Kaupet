import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import {
  clickNextAndWaitFor,
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

const TEST_CATEGORY_NAME = "E2E-test kjøretøy (ikke bruk)";

/** The isolated E2E runner serves this registration from its local fixture. */
const TEST_REGISTRATION = "AB12345";

test("registrert kjøretøy går fra oppslag til review og publisering", async ({
  page,
}, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewListing(page);

  const categorySearch = page.getByTestId("category-search-input");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill(TEST_CATEGORY_NAME);
  const categoryTile = page.locator(`[data-category-name="${TEST_CATEGORY_NAME}"]`);
  await categoryTile.click();
  await categoryTile.waitFor({ state: "detached" });

  await wizardStep(page, "vehicle-registration").waitFor();
  await expect(page.getByTestId("wizard-step-vehicle-360")).toHaveCount(0);
  await page.locator("#vehicle-reg-nr").fill(TEST_REGISTRATION);
  await clickNextAndWaitFor(
    page,
    page.getByRole("heading", { name: /Registreringsnummer AB 12345/ }),
    testInfo,
  );
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Volvo XC60");
  await confirmation.getByRole("button", { name: "Ja" }).click();
  await wizardStep(page, "photos").waitFor();
  await expect(page.getByTestId("wizard-step-vehicle-360")).toHaveCount(0);

  // Vehicle photos are optional in this deterministic fixture. Confirm the
  // no-image choice and continue to the facts page.
  await clickNextAndWaitFor(page, page.getByTestId("continue-without-image-button"), testInfo);
  await page.getByTestId("continue-without-image-button").click();
  await wizardStep(page, "vehicle-facts").waitFor();

  await page.locator("#mileage_km").fill("65000");
  await page
    .getByTestId("listing-description-textarea")
    .fill("Velholdt Volvo XC60 med komplett servicehistorikk og gode dekk.");
  await clickNextAndWaitFor(page, wizardStep(page, "vehicle-condition"), testInfo);

  await page.getByRole("combobox", { name: "Tilstand" }).click();
  await page.getByRole("option", { name: "Bruktbil" }).click();
  await page.getByRole("checkbox", { name: "Ingen kjente feil eller mangler" }).check();
  await clickNextAndWaitFor(page, wizardStep(page, "vehicle-price"), testInfo);

  await page.locator("#price_nok").fill("349000");
  await clickNextAndWaitFor(page, wizardStep(page, "location"), testInfo);

  await expect(page.getByTestId("wizard-step-vehicle-360")).toHaveCount(0);
  await expect(page.getByText("Publiseringsklar")).toBeVisible();
  await page.getByRole("button", { name: "Skriv inn postnummer" }).click();
  await page.locator("#postal_code").fill("0150");

  await publishAndExpectSuccess(page, testInfo);
});
