/**
 * Golden-path e2e test: log in and publish a Bil og MC listing via the
 * manual "kjøretøy ikke registrert" path (no Statens vegvesen lookup — that
 * external dependency would make CI runs depend on a third-party API being
 * reachable and returning a known-good plate). Covers the vehicle-specific
 * wizard steps (vehicle-registration, vehicle-facts, vehicle-condition)
 * that publish-listing.spec.ts's generic flow never exercises.
 *
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  clickNextAndWaitFor,
  fillDescriptionAndAdvance,
  goToNewListing,
  login,
  publishAndExpectSuccess,
  wizardStep,
} from "./pages/listing-wizard";

const { email, password } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { email: string; password: string };

// Dedicated e2e-only leaf under "Bil og MC" (see the
// 20260803090000_e2e_test_vehicle_category.sql and
// 20260803100000_fix_e2e_test_vehicle_category_filter_types.sql
// migrations), with exactly the two brand_select/model_select attributes
// (Merke/Modell) the vehicle title computation needs (see
// src/lib/vehicle/vehicle-title.ts) and nothing else. "isVehicle" is
// determined solely by having a brand_select filter (see
// vehicleCategoryGroupFor in src/lib/category-filters.ts), not by category
// ancestry — using plain text filters here would silently fall through to
// the generic (non-vehicle) attribute flow instead. Never rename/delete its
// slug ('e2e-test-vehicle') without updating this file.
const TEST_VEHICLE_CATEGORY_NAME = "E2E-test kjøretøy (ikke bruk)";
// Curated, always-present reference data (see
// 20260702000000_vehicle_brands_models.sql) — not e2e-specific, but stable
// enough to depend on here.
const TEST_BRAND = "Volvo";
const TEST_MODEL = "XC60";

test("logger inn og publiserer en kjøretøy-annonse (manuell registrering)", async ({
  page,
}, testInfo) => {
  // Permanent console/pageerror capture is wired up inside login() (see
  // listing-wizard.ts) — originally added here to investigate the silent
  // "Neste"-klikk issue below, moved so both specs get it, including
  // publish-listing.spec.ts's own unrelated, never-reproduced login flake.
  await login(page, email, password);
  await goToNewListing(page);

  // Top-level category-select step: "Bil og MC" is directly selectable
  // despite having children (see category-select/index.tsx's
  // `selectableGroups`) — clicking it doesn't drill down, it advances
  // straight to vehicle-registration.
  const bilOgMcTile = page.locator('[data-category-name="Bil og MC"]');
  await bilOgMcTile.waitFor({ timeout: 10_000 });
  await bilOgMcTile.click();
  await bilOgMcTile.waitFor({ state: "detached" });

  // vehicle-registration step: skip the Statens vegvesen lookup path and
  // pick the test leaf manually instead. The embedded category picker here
  // reuses the same tile markup as the top-level one.
  await wizardStep(page, "vehicle-registration").waitFor();
  await page.getByRole("button", { name: "Kjøretøyet er ikke registrert" }).click();
  await page.locator(`[data-category-name="${TEST_VEHICLE_CATEGORY_NAME}"]`).click();

  // Selecting the leaf reveals its attribute fields (Merke/Modell) on this
  // same page rather than advancing — wait for them instead of guessing at
  // the picker's internal confirmation delay. Both are Radix Select
  // comboboxes (brand_select/model_select), not plain text inputs — Modell
  // stays disabled until a recognized brand is picked.
  await page.getByLabel("Merke").waitFor();
  await page.getByLabel("Merke").click();
  await page.getByRole("option", { name: TEST_BRAND }).click();
  // Confirm the selection actually round-tripped into the controlled
  // Select's displayed value before touching Modell (which only becomes
  // enabled once a recognized brand is set) — the model list depends on an
  // async lookup keyed off the brand, so this also gives that lookup a
  // moment to resolve rather than racing it.
  await expect(page.getByLabel("Merke")).toContainText(TEST_BRAND);
  await page.getByLabel("Modell").click();
  await page.getByRole("option", { name: TEST_MODEL }).click();
  await expect(page.getByLabel("Modell")).toContainText(TEST_MODEL);

  // Bilder-siden (bundled with the now-inert generic category-attributes
  // group) asks about images before advancing, same as the generic flow.
  await clickNextAndWaitFor(page, page.getByTestId("continue-without-image-button"), testInfo);
  await page.getByTestId("continue-without-image-button").click();

  // vehicle-facts: title is computed from Merke/Modell (already filled) and
  // isn't directly editable for vehicles. Kilometerstand is required
  // whenever showMileage applies, which it does for this leaf. Unlike the
  // generic flow, vehicles have no "Gis bort gratis" checkbox at all (see
  // the `!isVehicle &&` guard in price/index.tsx) — a real price is
  // required.
  await wizardStep(page, "vehicle-facts").waitFor();
  await page.getByLabel("Kilometerstand").fill("42000");
  // getByLabel("Pris") is ambiguous — the step progressbar's aria-label
  // ("Steg 4 av 7: Pris & detaljer") also matches as a substring.
  await page.getByRole("textbox", { name: "Pris" }).fill("150000");

  // vehicle-condition: known-issues is required unless "no known issues" is
  // checked. Tilstand keeps its default value.
  await clickNextAndWaitFor(page, wizardStep(page, "vehicle-condition"), testInfo);

  // Covers registry.ts's `validateExtra` field-error path for this step
  // (previously untested — see UX-AUDIT-PLAN.md fase 6): advancing with
  // neither the checkbox nor free text filled in should block navigation
  // and show the inline error next to "Kjente feil og mangler" rather than
  // silently doing nothing.
  await page.getByTestId("wizard-next-button").click();
  // Scoped to the wizard step — the same text also briefly shows in a toast
  // notification (fase 6+7 inline feilvisning), which made the unscoped
  // getByText ambiguous (strict mode violation, 2 matches).
  await expect(
    wizardStep(page, "vehicle-condition").getByText(
      "Beskriv kjente feil og mangler, eller kryss av for at kjøretøyet ikke har noen.",
    ),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "Ingen kjente feil eller mangler" }).click();

  // Beskrivelse is its own step, identical to the generic flow.
  await clickNextAndWaitFor(page, wizardStep(page, "description-keywords"), testInfo);
  await fillDescriptionAndAdvance(
    page,
    testInfo,
    "Automatisk opprettet av en e2e-test. Bil i god stand, lite brukt.",
  );

  // Final step: delivery/location (vehicles can't be shipped, so this step
  // has nothing required to fill in) + publish confirmation share one page.
  await publishAndExpectSuccess(page, testInfo);
});
