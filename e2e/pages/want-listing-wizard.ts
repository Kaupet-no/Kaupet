import { expect, type Page } from "@playwright/test";

import { composerPage } from "./listing-wizard";

export async function startWantWithoutCategory(page: Page, title: string) {
  await composerPage(page, "title").getByLabel("Tittel").fill(title);
  await advanceWantStep(page, "category");
  await skipWantCategory(page);
}

/** Kategoristeget viser enten et forslag fra tittelen (ja/nei) eller velgeren,
 * avhengig av hva forslagsmotoren finner — «Nei, velg selv» fører til velgeren. */
export async function openWantCategoryPicker(page: Page) {
  const reject = page.getByRole("button", { name: "Nei, velg selv" });
  const search = page.getByTestId("category-search-input");
  await reject.or(search).first().waitFor();
  if (await reject.isVisible()) await reject.click();
}

export async function skipWantCategory(page: Page) {
  await openWantCategoryPicker(page);
  await page.getByRole("button", { name: "Jeg er usikker – fortsett uten kategori" }).click();
  await composerPage(page, "attributes").waitFor();
}

export async function advanceWantStep(page: Page, expectedPage: string) {
  await page.getByRole("button", { name: /^(Fortsett|Neste:)/ }).click();
  await composerPage(page, expectedPage).waitFor();
}

export async function publishWantAndExpectSuccess(page: Page) {
  await page.getByRole("button", { name: /^(Publiser|Publiser kjøpsønske)/ }).click();
  await expect(
    page.getByRole("heading", { name: "Ønskes kjøpt-annonse publisert!" }),
  ).toBeVisible();
}
