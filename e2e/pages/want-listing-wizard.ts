import { expect, type Page } from "@playwright/test";

import { composerPage } from "./listing-wizard";

export async function startWantWithoutCategory(page: Page, title: string) {
  await page.getByLabel("Kort beskrivelse").fill(title);
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
