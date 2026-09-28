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
  const native = !testInfo.project.name.endsWith("web");
  await goToNewWantListing(page, native);
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
  // Native starter med tittelkortet (kategoriforslaget bygger på tittelen);
  // web har tittel og kategori på samme side.
  if (native) {
    await composerPage(page, "title").waitFor();
  } else {
    await composerPage(page, "category").waitFor();
    await page.getByTestId("category-tile").first().waitFor();
  }
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("want-listing-category.png", {
    animations: "disabled",
    fullPage: true,
  });
});
