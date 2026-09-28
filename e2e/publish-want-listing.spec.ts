import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

import {
  chooseCategory,
  composerPage,
  goBackToStep,
  goToNewWantListing,
  login,
} from "./pages/listing-wizard";
import {
  advanceWantStep,
  openWantCategoryPicker,
  publishWantAndExpectSuccess,
  startWantWithoutCategory,
} from "./pages/want-listing-wizard";

const { users } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { users: Record<string, { email: string; password: string }> };

// Samme skjulte testkategori som publish-listing.spec.ts, der global-setup.ts
// har lagt tre faste annonser med «e2efilterfixture» i tittelen (gratis, 100
// og 200 kr).
const TEST_CATEGORY_NAME = "E2E-test (ikke bruk)";

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

  // Se over viser kjøpsønsket slik selgerne ser det; hver del tar deg til
  // steget der den fylles ut, og Neste går rett tilbake hit.
  await expect(page.getByText(/^1\s500 kr$/)).toBeVisible();
  await page.getByRole("button", { name: /Endre maks pris/ }).click();
  await composerPage(page, "details").waitFor();
  const maxPrice = page.getByLabel("Maks pris du vil betale (valgfritt)");
  await maxPrice.fill("1200");
  await advanceWantStep(page, "review");
  await expect(page.getByText(/^1\s200 kr$/)).toBeVisible();

  // Stegtelleren er fortsatt veien tilbake til et vilkårlig tidligere steg (W7/W8).
  await goBackToStep(page, "Siste detaljer");
  await composerPage(page, "details").waitFor();
  await advanceWantStep(page, "review");

  // Varsling er på som standard.
  await expect(
    page.getByRole("checkbox", { name: "Varsle meg om matchende annonser" }),
  ).toBeChecked();
  await publishWantAndExpectSuccess(page);
});

test("forklarer hvorfor kjøpsønsket ikke kan fortsette", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page);
  // Uten tittel stopper flyten på tittelsteget, med årsaken både ved feltet
  // og i feiloppsummeringen — ikke først på neste steg.
  await page.getByRole("button", { name: /^Neste:/ }).click();
  await expect(composerPage(page, "title")).toBeVisible();
  await expect(page.getByText("Rett feltene som er markert før du fortsetter.")).toBeVisible();
  await expect(page.getByText("Tittelen må være minst 3 tegn")).toBeVisible();

  await startWantWithoutCategory(page, "E2E ønsker å kjøpe barnestol");
});

test("bruker atomiske, validerte kort i native kjøpsønske", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page, true);

  // Tittelen først — kategoriforslaget bygger på den.
  await composerPage(page, "title").waitFor();
  await page.getByRole("button", { name: "Fortsett" }).click();
  await expect(page.getByText("Rett feltene som er markert før du fortsetter.")).toBeVisible();
  await expect(composerPage(page, "title")).toBeVisible();

  await startWantWithoutCategory(page, "E2E ønsker å kjøpe barnestol");
  await advanceWantStep(page, "details");
  await advanceWantStep(page, "review");
});

test("viser annonser som allerede matcher kjøpsønsket", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);

  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page);
  await composerPage(page, "title").getByLabel("Tittel").fill("E2E ønsker treffsjekk");
  await advanceWantStep(page, "category");
  await openWantCategoryPicker(page);
  await chooseCategory(page, TEST_CATEGORY_NAME);
  await composerPage(page, "attributes").waitFor();

  // Ord fra beskrivelsen til de tre faste annonsene, uten treff i søket som
  // core.visual.spec.ts tar skjermbilde av.
  await page.getByLabel("Nøkkelord for treff (valgfritt)").fill("E2E-filterfixture");
  await expect(
    page.getByText("3 annonser til salgs matcher allerede det du leter etter."),
  ).toBeVisible();

  await advanceWantStep(page, "details");
  await page.getByLabel("Maks pris du vil betale (valgfritt)").fill("150");
  await expect(
    page.getByText("2 annonser til salgs matcher allerede det du leter etter."),
  ).toBeVisible();

  await advanceWantStep(page, "review");
  await publishWantAndExpectSuccess(page);
  await expect(page.getByRole("heading", { name: "2 annonser matcher allerede" })).toBeVisible();
  await expect(page.getByRole("link", { name: /e2efilterfixture rimelig/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /e2efilterfixture dyrere/ })).toHaveCount(0);
});
