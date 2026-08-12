/**
 * Native e2e coverage for the global search panel (`SearchPanel`,
 * fase 12) — flagged as missing tech debt in docs/UX-GJENSTAENDE-PLAN.md.
 * `?forcenative` (dev-only, see src/lib/native.ts) flips `isNative()` on in
 * a plain browser so the panel's native-only entry points render without a
 * simulator.
 */
import { expect, test, type Locator } from "@playwright/test";

async function expectNativeTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
}

test("holder filter som utkast frem til brukeren anvender dem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/annonser?forcenative&sort=new");
  await page.waitForLoadState("networkidle");

  const filterButton = page.getByRole("button", { name: /Filtrer/ });
  await expectNativeTouchTarget(filterButton);
  await filterButton.click();

  const applyButton = page.getByRole("button", { name: "Bruk filtre" });
  await expect(applyButton).toBeVisible({ timeout: 10_000 });
  await expectNativeTouchTarget(page.getByRole("button", { name: "Helt ny" }));

  await page.getByRole("checkbox", { name: "Inkluder gratis-annonser" }).click();
  await expect(page).not.toHaveURL(/includeFree=false/);

  await applyButton.click();
  await expect(applyButton).not.toBeVisible();
  await expect(page).toHaveURL(/includeFree=false/);
});
