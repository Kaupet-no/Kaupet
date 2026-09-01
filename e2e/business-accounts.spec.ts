import { expect, test } from "./fixtures";

test.describe("bedriftskonto", () => {
  test("privat registrering er fortsatt standard", async ({ page }) => {
    await page.goto("/auth?mode=signup");

    await expect(page.locator("#account-type-private")).toBeChecked();
    await expect(page.getByLabel("Visningsnavn")).toBeVisible();
    await expect(page.getByLabel("E-post")).toBeVisible();
  });

  test("bedriftsregistrering validerer organisasjonsnummer lokalt", async ({ page }) => {
    await page.goto("/auth?mode=signup");
    await page.locator("#account-type-business").check();

    await expect(page.getByRole("heading", { name: "Finn bedriften" })).toBeVisible();
    await page.getByLabel("Organisasjonsnummer").fill("123");
    await page.getByRole("button", { name: "Søk" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Skriv inn et gyldig organisasjonsnummer med kontrollsiffer.",
    );
  });
});
