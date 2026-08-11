/**
 * Native e2e coverage for the global search panel (`SearchPanel`,
 * fase 12) — flagged as missing tech debt in docs/UX-GJENSTAENDE-PLAN.md.
 * `?forcenative` (dev-only, see src/lib/native.ts) flips `isNative()` on in
 * a plain browser so the panel's native-only entry points render without a
 * simulator.
 */
import { expect, test } from "@playwright/test";

test("åpner søkepanelet over /annonser, endrer filter og lukker med treff-knappen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/annonser?forcenative&sort=new");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Filtrer/ }).click();

  const showButton = page.getByRole("button", { name: /Vis \d+ treff/ });
  await expect(showButton).toBeVisible({ timeout: 10_000 });

  await showButton.click();
  await expect(showButton).not.toBeVisible();
  await expect(page).toHaveURL(/\/annonser\?/);
});
