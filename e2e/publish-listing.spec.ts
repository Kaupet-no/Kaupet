/**
 * Golden-path e2e test: log in and publish a listing.
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const { email, password } = JSON.parse(
  readFileSync(path.join(__dirname, ".auth", "user.json"), "utf-8"),
) as { email: string; password: string };

test("logger inn og publiserer en annonse", async ({ page }) => {
  await page.goto("/auth");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord").fill(password);
  await page.getByRole("button", { name: "Logg inn" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/ny-annonse");
  await page.getByLabel("Tittel").fill("E2E testannonse — Stokke Tripp Trapp");
  await page
    .getByLabel("Beskrivelse")
    .fill("Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.");

  await page.getByText("Velg hovedkategori").click();
  await page.getByRole("option").first().click();
  const subcategoryPlaceholder = page.getByText("Velg underkategori");
  if (await subcategoryPlaceholder.isVisible().catch(() => false)) {
    await subcategoryPlaceholder.click();
    await page.getByRole("option").first().click();
  }

  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  await page.getByRole("button", { name: "Publiser annonse" }).click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
});
