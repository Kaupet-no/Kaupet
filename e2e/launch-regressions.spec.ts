import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { chooseCategory, login } from "./pages/listing-wizard";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 740, height: 390 },
]) {
  test(`DEF-MAP-01: mobilkart fyller skjermen ved ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/annonser");
    await page.locator("html[data-kaupet-hydrated='true']").waitFor();
    const trigger = page.getByRole("button", { name: "Kart", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Kart over søkeresultater" });
    await expect(dialog).toBeVisible();
    const map = dialog.locator(".leaflet-container");
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box!.height).toBeGreaterThan(viewport.height * 0.7);
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9);
    await dialog.getByRole("button", { name: "Lukk kart", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test("DEF-INVITE-01: utløpt lenke forklares på forsiden", async ({ page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Token+expired");
  await expect(
    page.getByRole("alert").filter({ hasText: "Lenken kunne ikke åpnes" }),
  ).toContainText("sende invitasjonen på nytt");
});

test("DEF-DRAFT-01: innlogging i annen fane fryser eksisterende utkast", async ({
  page,
  context,
}, testInfo) => {
  const { users } = JSON.parse(readFileSync(new URL(".auth/user.json", import.meta.url), "utf8"));
  const credentials = users[testInfo.project.name];
  await login(page, credentials.email, credentials.password, "/ny-annonse?type=sell");
  await chooseCategory(page, "E2E-test (ikke bruk)");
  const title = "Utkast som tilhører den første kontoen";
  await page.getByTestId("listing-title-input").fill(title);
  await expect
    .poll(() =>
      page.evaluate(
        (value) =>
          Object.entries(localStorage).some(
            ([key, content]) =>
              key.startsWith("kaupet_draft_sell_listing:") && content.includes(value),
          ),
        title,
      ),
    )
    .toBe(true);
  const second = await context.newPage();
  await second.goto("/");
  await context.clearCookies();
  await login(
    second,
    users[testInfo.project.name === "desktop-web" ? "mobile-web" : "desktop-publish"].email,
    users[testInfo.project.name === "desktop-web" ? "mobile-web" : "desktop-publish"].password,
    "/ny-annonse?type=sell",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Kontoen er endret" })).toBeVisible();
  await expect(second.getByText(title, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("listing-title-input")).toHaveCount(0);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Åpne en ny annonse med denne kontoen" }).click();
  await expect(page.getByTestId("category-search-input")).toBeVisible();
  expect(dialogs).toEqual([]);
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await second.close();
});
