import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { composerPage, goToNewWantListing, login } from "./pages/listing-wizard";
import {
  advanceWantStep,
  publishWantAndExpectSuccess,
  startWantWithoutCategory,
} from "./pages/want-listing-wizard";

const { users } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { users: Record<string, { email: string; password: string }> };

test("oppretter, gjennomgår og publiserer et kjøpsønske", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page);
  await startWantWithoutCategory(page, "E2E ønsker å kjøpe barnestol");
  await advanceWantStep(page, "details");

  await page.getByLabel("Beskrivelse / krav (valgfritt)").fill("Må være hel og i god stand.");
  await page.getByLabel("Maks pris du vil betale (valgfritt)").fill("1500");
  await advanceWantStep(page, "review");

  const detailsRow = page.locator("dl > div").filter({ hasText: "Detaljer" });
  await detailsRow.getByRole("button", { name: "Endre" }).click();
  await composerPage(page, "details").waitFor();
  await page.getByLabel("Maks pris du vil betale (valgfritt)").fill("1200");
  await advanceWantStep(page, "review");
  await expect(page.getByText("Maks 1 200 kr")).toBeVisible();

  await page.getByRole("checkbox", { name: "Varsle meg om matchende annonser" }).click();
  await publishWantAndExpectSuccess(page);
});

test("forklarer hvorfor kjøpsønsket ikke kan fortsette", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page);
  await page.getByLabel("Kort beskrivelse").fill("Midlertidig tittel");
  await page.getByRole("button", { name: "Jeg er usikker – fortsett uten kategori" }).click();
  await composerPage(page, "attributes").waitFor();
  await page.getByRole("button", { name: "Tilbake" }).click();
  await composerPage(page, "category").waitFor();
  await page.getByLabel("Kort beskrivelse").fill("");
  await page.getByRole("button", { name: "Jeg er usikker – fortsett uten kategori" }).click();
  await composerPage(page, "attributes").waitFor();
  await expect(
    page.getByText("Legg inn en kort beskrivelse på første steg før du fortsetter."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Fortsett|Neste:)/ })).toBeDisabled();
});
