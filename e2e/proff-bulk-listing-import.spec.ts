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
  test("forhåndsviser og oppretter to annonser", async ({ page }, testInfo) => {
    test.skip(
      skipNonDesktop(testInfo.project.name),
      "Masseimportens E2E-fixture bruker desktop-Proff.",
    );
    const credentials = users["desktop-web"];
    if (!credentials) throw new Error("Mangler desktop E2E-bruker");
    await login(page, credentials.email, credentials.password);
    await page.goto("/bedrift?tab=annonser");
    await page.getByRole("button", { name: "Importer annonser" }).click();
    const csvPath = testInfo.outputPath("bulk-import.csv");
    writeFileSync(csvPath, validCsv);
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("2 gyldige · 0 ugyldige")).toBeVisible();
    await page.getByRole("button", { name: "Opprett annonser" }).click();
    await expect(page.getByText(/Du er i ferd med å opprette 2 annonser/)).toBeVisible();
    await page.getByRole("button", { name: "Bekreft oppretting" }).click();
    const result = page.locator("section").filter({ hasText: "Import ferdig" });
    await expect(result).toContainText("Opprettet");
    await expect(result).toContainText("2");
    await result.getByRole("link", { name: "Åpne annonsen" }).first().click();
    await expect(page.getByRole("heading", { name: "Bulk annonse én" })).toBeVisible();
    await expect(page.getByText("1 200 kr")).toBeVisible();
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
    await page.getByRole("button", { name: "Importer annonser" }).click();
    const csvPath = testInfo.outputPath("bulk-import-invalid.csv");
    writeFileSync(
      csvPath,
      `${validCsv.split("\n").slice(0, 1).join("\n")}\nbulk-invalid;e2e-test-listing;kort;Dette er en gyldig beskrivelse fra masseimport.;1200;good;nei`,
    );
    await page.getByLabel("Velg importfil").setInputFiles(csvPath);
    await expect(page.getByText("0 gyldige · 1 ugyldige")).toBeVisible();
    await expect(page.getByRole("button", { name: "Opprett annonser" })).toBeDisabled();
    await expect(page.getByText("Tittelen må ha minst 5 tegn.")).toBeVisible();
  });
});
