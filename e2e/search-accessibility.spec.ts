import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function waitForHydration(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

test("mobil toppsøk fokuserer sidesøket på annonser", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-web", "Krever mobil web-prosjekt");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/annonser");
  await waitForHydration(page);

  await page.getByRole("button", { name: "Åpne søk" }).click();
  await expect(page.locator("#annonser-search-input")).toBeFocused();
});

test("søkeforslag har strukturert type og tilgjengelig tilkobling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/annonser");
  await waitForHydration(page);

  const input = page.getByRole("textbox", { name: "Søk i annonser" });
  await input.fill("iPhone");
  await input.focus();

  await expect(input).toHaveAttribute("aria-controls", "annonser-search-suggestions");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("listbox", { name: "Søkeforslag" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Søk etter «iPhone»" })).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText(/\d+ annonser?/);
});

test("native søkepanel viser tilgjengelig live-handling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/annonser?forcenative");
  await waitForHydration(page);

  await page.getByRole("button", { name: /Filtrer/ }).click();
  const applyButton = page.getByTestId("search-filter-apply-button");
  await expect(applyButton).toBeVisible();
  await expect(applyButton).toHaveText(/Vis \d+ annonser?/);
  await expect(page.getByRole("button", { name: /Kategori/ })).toBeVisible();
});
