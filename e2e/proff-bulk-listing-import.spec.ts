import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import { login } from "./pages/listing-wizard";

const { users } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { users: Record<string, { email: string; password: string }> };

const validCsv = [
  "external_id;category;title;description;price;condition;can_ship",
  "bulk-1;e2e-test-listing;Bulk annonse én;Dette er en gyldig beskrivelse fra masseimport.;1200;good;nei",
  "bulk-2;e2e-test-listing;Bulk annonse to;Dette er en annen gyldig beskrivelse fra masseimport.;2400;good;nei",
].join("\n");

function skipNonDesktop(projectName: string) {
  return projectName !== "desktop-web";
}

test.describe("Proff masseimport", () => {
  test("skjuler lokasjonsvalg for bedrifter med én lokasjon", async ({ page }, testInfo) => {
    test.skip(
      skipNonDesktop(testInfo.project.name),
      "Lokasjonskontekst-fixture bruker desktop-Proff.",
    );
    const credentials = users["desktop-web"];
    if (!credentials) throw new Error("Mangler desktop E2E-bruker");
    await login(page, credentials.email, credentials.password);
    // The location management UI (and its "Ny lokasjon koster..." pricing
    // notice) lives on "administrer", not "bedriftsprofil" — see
    // business-admin-panel.tsx.
    await page.goto("/bedrift?tab=administrer");
    await page.locator("html[data-kaupet-hydrated='true']").waitFor();

    await expect(page.getByLabel("Aktiv lokasjon")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Lokasjoner" })).toHaveCount(0);
    await expect(page.getByText("Adressen velges per lokasjon")).toHaveCount(0);
    await expect(page.getByText(/Ny lokasjon koster 249 kr per måned per lokasjon/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ny lokasjon" })).toBeVisible();
  });

  test("forhåndsviser og oppretter to annonser", async ({ page }, testInfo) => {
    test.skip(
      skipNonDesktop(testInfo.project.name),
      "Masseimportens E2E-fixture bruker desktop-Proff.",
    );
    const credentials = users["desktop-web"];
    if (!credentials) throw new Error("Mangler desktop E2E-bruker");
    await login(page, credentials.email, credentials.password);
    await page.goto("/bedrift?tab=annonser");
    await page.locator("html[data-kaupet-hydrated='true']").waitFor();
    await page.getByRole("button", { name: "Importer annonser" }).click();
    const csvPath = testInfo.outputPath("bulk-import.csv");
    writeFileSync(csvPath, validCsv);
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("2 gyldige · 0 ugyldige")).toBeVisible();
    // Dry-run-forhåndsvisningen kjører automatisk og markerer begge radene
    // som nye før noe er skrevet til databasen.
    await expect(page.getByText("Ny").first()).toBeVisible();
    await page.getByRole("button", { name: "Start import" }).click();
    await expect(page.getByText(/Du er i ferd med å importere 2 rader/)).toBeVisible();
    await page.getByRole("button", { name: "Bekreft import" }).click();
    const result = page.locator("section").filter({ hasText: "Import ferdig" });
    await expect(result).toContainText("Opprettet");
    await expect(result).toContainText("2");
    await result.getByRole("link", { name: "Åpne annonsen" }).first().click();
    await expect(page.getByRole("heading", { name: "Bulk annonse én" })).toBeVisible();
    await expect(page.getByText("1 200 kr")).toBeVisible();
  });

  test("samme fil lastet opp på nytt gir uendret/finnes allerede og ingen nye annonser", async ({
    page,
  }, testInfo) => {
    test.skip(
      skipNonDesktop(testInfo.project.name),
      "Masseimportens E2E-fixture bruker desktop-Proff.",
    );
    const credentials = users["desktop-web"];
    if (!credentials) throw new Error("Mangler desktop E2E-bruker");
    await login(page, credentials.email, credentials.password);
    await page.goto("/bedrift?tab=annonser");
    await page.locator("html[data-kaupet-hydrated='true']").waitFor();
    const csvPath = testInfo.outputPath("bulk-import-repeat.csv");
    // Egen external_id-serie enn de andre testene i denne filen, slik at
    // testene ikke kolliderer når de kjører mot samme organisasjon.
    const repeatCsv = [
      "external_id;category;title;description;price;condition;can_ship",
      "bulk-repeat-1;e2e-test-listing;Bulk gjentatt annonse;Dette er en gyldig beskrivelse fra masseimport.;1500;good;nei",
    ].join("\n");
    writeFileSync(csvPath, repeatCsv);

    // Første opplasting: raden er ny og opprettes.
    await page.getByRole("button", { name: "Importer annonser" }).click();
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("1 gyldige · 0 ugyldige")).toBeVisible();
    await expect(page.getByText("Ny")).toBeVisible();
    await page.getByRole("button", { name: "Start import" }).click();
    await page.getByRole("button", { name: "Bekreft import" }).click();
    await expect(page.locator("section").filter({ hasText: "Import ferdig" })).toContainText(
      "Opprettet",
    );

    // Andre opplasting av samme fil, i standardmodus (opprett og oppdater):
    // radens external_id finnes fra før, og innholdet er uendret.
    await page.getByRole("button", { name: "Importer en ny fil" }).click();
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("1 gyldige · 0 ugyldige")).toBeVisible();
    await expect(page.getByText("Uendret")).toBeVisible();
    await page.getByRole("button", { name: "Start import" }).click();
    await page.getByRole("button", { name: "Bekreft import" }).click();
    const secondResult = page.locator("section").filter({ hasText: "Import ferdig" });
    await expect(secondResult).toContainText("Uendret");

    // Tredje opplasting i «Kun nye annonser»-modus: raden finnes fra før og
    // skal vises som duplikat i forhåndsvisningen, uten å opprette noe nytt.
    await page.getByRole("button", { name: "Importer en ny fil" }).click();
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await page.getByRole("radio", { name: /Kun nye annonser/ }).click();
    await expect(page.getByText("Finnes allerede")).toBeVisible();
  });

  test("deaktiverer oppretting når én rad er ugyldig", async ({ page }, testInfo) => {
    test.skip(
      skipNonDesktop(testInfo.project.name),
      "Masseimportens E2E-fixture bruker desktop-Proff.",
    );
    const credentials = users["desktop-web"];
    if (!credentials) throw new Error("Mangler desktop E2E-bruker");
    await login(page, credentials.email, credentials.password);
    await page.goto("/bedrift?tab=annonser");
    await page.locator("html[data-kaupet-hydrated='true']").waitFor();
    await page.getByRole("button", { name: "Importer annonser" }).click();
    const csvPath = testInfo.outputPath("bulk-import-invalid.csv");
    writeFileSync(
      csvPath,
      `${validCsv.split("\n").slice(0, 1).join("\n")}\nbulk-invalid;e2e-test-listing;kort;Dette er en gyldig beskrivelse fra masseimport.;1200;good;nei`,
    );
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("0 gyldige · 1 ugyldige")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start import" })).toBeDisabled();
    await expect(page.getByText("Tittelen må ha minst 5 tegn.")).toBeVisible();
  });
});
