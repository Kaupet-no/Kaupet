/**
 * F5 (sluttbrukertest): en innlogget bruker som åpner /ny-annonse direkte
 * (bokmerke, delt lenke, app-snarvei, manuell adresse) uten et utkast og
 * uten valgt type skal ende opp i typevelger-dialogen — ikke stille på en
 * uforklart forside. Se redirect-effekten i ny-annonse.tsx og ?opprett=1-
 * håndteringen i routes/index.tsx.
 */
import { readFileSync } from "node:fs";
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

test("direktelenke til /ny-annonse uten utkast åpner typevelgeren på forsiden", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-web",
    "Typevelger-dialogen på forsiden er bare bygget for web-landingssiden",
  );
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);
  const { email, password } = credentials;
  await login(page, email, password);

  // Ingen ?type=sell og ingen utkast i localStorage — akkurat slik en
  // bokmerket/delt lenke til /ny-annonse ville sett ut.
  await page.goto("/ny-annonse");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();

  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Hva vil du selge?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Jeg vil selge" })).toBeVisible();
});
