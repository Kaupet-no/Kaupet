import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

import { composerPage, goToNewWantListing, login } from "./pages/listing-wizard";

const { users } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { users: Record<string, { email: string; password: string }> };

test("kjøpsønskets startflate holder visuell kontrakt", async ({ page }, testInfo) => {
  const credentials = users[testInfo.project.name];
  if (!credentials) throw new Error(`Mangler E2E-bruker for prosjektet ${testInfo.project.name}`);
  await login(page, credentials.email, credentials.password);
  await goToNewWantListing(page, !testInfo.project.name.endsWith("web"));
  await composerPage(page, "category").waitFor();

  await expect(page).toHaveScreenshot("want-listing-category.png", {
    animations: "disabled",
    fullPage: true,
  });
});
