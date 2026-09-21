import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

import { composerPage, goBackToStep, goToNewWantListing, login } from "./pages/listing-wizard";
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

  // Oppsummeringen med «Endre» per rad ble fjernet i ui-gjennomgangen (W9);
  // stegtelleren er nå veien tilbake til et tidligere steg (W7/W8).
  await goBackToStep(page, "Siste detaljer");
  await composerPage(page, "details").waitFor();
  // Oppsummeringen som viste «Maks 1 200 kr» ble fjernet sammen med resten av
  // ComposerReview (W9), og beløpet vises ikke lenger noe sted i flyten. At
  // feltet holder den nye verdien er det som gjenstår å bekrefte her — altså
  // at stegmenyen faktisk tok oss til riktig steg og at redigeringen satt.
  const maxPrice = page.getByLabel("Maks pris du vil betale (valgfritt)");
  await maxPrice.fill("1200");
  await expect(maxPrice).toHaveValue("1200");
  await advanceWantStep(page, "review");

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

test("bruker atomiske, validerte kort i native kjøpsønske", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page, true);
  await expect(page.getByLabel("Kort beskrivelse")).toHaveCount(0);

  await page.getByRole("button", { name: "Jeg er usikker – fortsett uten kategori" }).click();
  await composerPage(page, "title").waitFor();
  await page.getByRole("button", { name: "Fortsett" }).click();
  await expect(page.getByText("Rett feltene som er markert før du fortsetter.")).toBeVisible();
  await expect(composerPage(page, "title")).toBeVisible();

  await composerPage(page, "title").getByLabel("Tittel").fill("E2E ønsker å kjøpe barnestol");
  await advanceWantStep(page, "attributes");
  await advanceWantStep(page, "details");
  await advanceWantStep(page, "review");
});
