import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const FILTER_QUERY = "e2efilterfixture";

async function waitForHydration(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

async function openResults(page: Page, native: boolean) {
  await page.goto(`/annonser?q=${FILTER_QUERY}&sort=price_asc${native ? "&forcenative=1" : ""}`);
  await waitForHydration(page);
  await page.getByRole("link", { name: /e2efilterfixture gratis/ }).waitFor();
}

test("forsiden holder visuell kontrakt", async ({ page }, testInfo) => {
  if (!testInfo.project.name.endsWith("web")) {
    await page.addInitScript(() => {
      localStorage.setItem("kaupet_onboarding_completed_v1", "true");
    });
  }
  await page.goto(testInfo.project.name.endsWith("web") ? "/" : "/?forcenative=1");
  await waitForHydration(page);
  if (testInfo.project.name.endsWith("web")) {
    await page.locator('input[aria-label="Søk i annonser"]').last().focus();
  }
  await expect(page).toHaveScreenshot("homepage.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("det native søkepanelet holder visuell kontrakt", async ({ page }) => {
  await page.goto("/annonser?sort=price_asc&forcenative=1");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Filtrer", exact: true }).click();
  await page.getByRole("heading", { name: "Søk og filtrer" }).waitFor();
  await expect(page).toHaveScreenshot("search-panel.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("resultatflaten holder visuell kontrakt", async ({ page }, testInfo) => {
  await openResults(page, !testInfo.project.name.endsWith("web"));
  await expect(page).toHaveScreenshot("results.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("annonsedetaljen holder visuell kontrakt", async ({ page }, testInfo) => {
  await openResults(page, !testInfo.project.name.endsWith("web"));
  await page
    .getByRole("link", { name: /e2efilterfixture gratis/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/\d{8}(?:\?|$)/);
  await page.getByRole("button", { name: "Logg inn for å sende melding" }).waitFor();
  await expect(page).toHaveScreenshot("listing-detail.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("innlogging holder visuell kontrakt", async ({ page }) => {
  await page.goto("/auth?mode=signin");
  await waitForHydration(page);
  await page.getByRole("heading", { name: "Logg inn" }).waitFor();
  await expect(page).toHaveScreenshot("auth.png", {
    animations: "disabled",
    fullPage: true,
  });
});
