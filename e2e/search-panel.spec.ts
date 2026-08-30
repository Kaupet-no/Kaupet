/**
 * Native e2e coverage for the global search panel (`SearchPanel`,
 * fase 12) — flagged as missing tech debt in docs/plans/UX-GJENSTAENDE-PLAN.md.
 * `?forcenative` (dev-only, see src/lib/native.ts) flips `isNative()` on in
 * a plain browser so the panel's native-only entry points render without a
 * simulator.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "./fixtures";

const { filterFixture } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { filterFixture: { query: string; total: number; paid: number } };

async function expectNativeTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
}
test("bevarer native søkeopplevelse etter intern ruting", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("kaupet_onboarding_completed_v1", "true");
  });
  await page.goto("/?forcenative=1");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();

  await page.getByRole("button", { name: "Søk", exact: true }).last().click();
  await expect(page).toHaveURL(/\/annonser\?/);
  await expect(page.getByRole("dialog", { name: "Søk og filtrer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Kategori/ })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/native/);
});

test("holder filter som utkast frem til brukeren anvender dem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/annonser?forcenative&q=${filterFixture.query}&sort=new`);
  await page.waitForLoadState("networkidle");

  const filterButton = page.getByRole("button", { name: /Filtrer/ });
  await expectNativeTouchTarget(filterButton);
  await filterButton.click();

  const applyButton = page.getByTestId("search-filter-apply-button");
  await expect(applyButton).toBeVisible({ timeout: 10_000 });
  await expect(applyButton).toHaveText(`Vis ${filterFixture.total} annonser`);

  const conditionButton = page.getByRole("button", { name: /Tilstand/ });
  await expectNativeTouchTarget(conditionButton);
  await conditionButton.click();
  await expectNativeTouchTarget(page.getByRole("option", { name: "Helt ny" }));
  await page.getByRole("button", { name: "Bruk valg" }).click();

  await expect(page.getByRole("button", { name: /Alle kategorier/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bil og MC" })).not.toBeVisible();
  await page.getByRole("button", { name: /Alle kategorier/ }).click();
  await expect(page.getByRole("heading", { name: "Velg kategori" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bil og MC" })).toBeVisible();
  await page.getByRole("button", { name: "Ferdig" }).click();

  await expect(page.getByRole("button", { name: /Alle filtre/ })).toBeVisible();

  await page.getByRole("button", { name: /^Pris/ }).click();
  await page.getByRole("checkbox", { name: "Inkluder gratis-annonser" }).click();
  await expect(page).not.toHaveURL(/includeFree=false/);
  await expect(applyButton).toHaveText("Beregner treff …");
  await expect(applyButton).toHaveText(`Vis ${filterFixture.paid} annonser`, { timeout: 10_000 });

  await applyButton.click();
  await expect(applyButton).not.toBeVisible();
  await expect(page).toHaveURL(/includeFree=false/);
});
