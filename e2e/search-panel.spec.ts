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

  // Søk-fanen er et sted: den går til resultatsiden, ikke en skuff over forsiden.
  const searchTab = page.getByRole("button", { name: "Søk", exact: true }).last();
  await searchTab.click();
  await expect(page).toHaveURL(/\/annonser/);
  await expect(page.getByRole("dialog", { name: "Søk og filtrer" })).not.toBeVisible();
  // Forsiden har også et searchbox; vent på resultatsidens (name="q") så vi
  // ikke trykker på fanen mens den gamle ruten fortsatt er montert.
  const searchbox = page.locator('main input[name="q"]');
  await expect(searchbox).toBeVisible();
  await expect(searchTab).toHaveAttribute("aria-current", "page");
  await expect(page.locator("html")).toHaveClass(/native/);

  // Nytt trykk på aktiv fane øverst på siden setter fokus i søkefeltet.
  await searchTab.click();
  await expect(searchbox).toBeFocused();
});
test("søker fra native hjem og lander på delbar resultat-URL", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("kaupet_onboarding_completed_v1", "true");
  });
  await page.goto("/?forcenative=1");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();

  // Forsiden har et ekte søkefelt: Enter sender søket rett til /annonser.
  const input = page.getByRole("searchbox", { name: "Søk i annonser" });
  await input.fill("sykkel");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/annonser\?.*q=sykkel/);
  await expect(page.getByRole("searchbox", { name: "Søk i annonser" })).toHaveValue("sykkel");
});
test("søker i nytt kartområde uten å endre URL før eksplisitt handling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/nominatim.openstreetmap.org/reverse**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ address: { city: "Oslo", country_code: "no" } }),
    });
  });
  await page.goto(`/annonser?forcenative&q=${filterFixture.query}&sort=new`);
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();

  const mapButton = page.getByRole("button", { name: "Vis kart" });
  await expect(mapButton).toBeVisible();
  await mapButton.click();

  const mapDialog = page.getByRole("dialog", { name: "Kart over søkeresultater" });
  await expect(mapDialog).toBeVisible();
  await expect(mapDialog.getByText("Kartverket")).toBeVisible();
  const map = mapDialog.locator(".leaflet-container");
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24);
  await page.mouse.up();

  const searchAreaButton = mapDialog.getByRole("button", { name: "Søk i dette området" });
  await expect(searchAreaButton).toBeVisible();
  const before = page.url();
  await searchAreaButton.click();
  await expect(page).not.toHaveURL(before);
  await expect(page).toHaveURL(/[?&]lat=/);
});

test("holder filter som utkast frem til brukeren anvender dem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/annonser?forcenative&q=${filterFixture.query}&sort=new`);
  await page.waitForLoadState("networkidle");

  const filterButton = page.getByRole("button", { name: /Alle filtre/ });
  await expectNativeTouchTarget(filterButton);
  await filterButton.click();

  const applyButton = page.getByTestId("search-filter-apply-button");
  await expect(applyButton).toBeVisible({ timeout: 10_000 });
  await expect(applyButton).toHaveText(`Vis ${filterFixture.total} annonser`);

  const newCondition = page.getByRole("group", { name: "Velg tilstand" }).getByRole("button", {
    name: "Helt ny",
  });
  await expectNativeTouchTarget(newCondition);
  await newCondition.click();
  await expect(newCondition).toHaveAttribute("aria-pressed", "true");
  await newCondition.click();

  await page.getByRole("button", { name: /Kategori/ }).click();
  await expect(page.getByRole("heading", { name: "Velg kategori" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bil og MC" })).toBeVisible();
  await page.getByRole("button", { name: "Tilbake til filteroversikt" }).click();

  await page.getByRole("switch", { name: "Ta med gratis-annonser" }).click();
  await expect(page).not.toHaveURL(/includeFree=false/);
  await expect(
    page.getByRole("status").filter({ hasText: "Beregner nytt antall treff" }),
  ).toBeVisible();
  await expect(applyButton).toHaveText(/Vis \d+ annonser?/);
  await expect(applyButton).toHaveText(`Vis ${filterFixture.paid} annonser`, { timeout: 10_000 });

  await applyButton.click();
  await expect(applyButton).not.toBeVisible();
  await expect(page).toHaveURL(/includeFree=false/);
});
