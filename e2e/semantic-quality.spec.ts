import { expect, test } from "@playwright/test";

test("kritiske offentlige sider har landemerker og ingen nøstede interaksjoner", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Hovednavigasjon" })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  const nestedInteractive = await page
    .locator(
      "a button, a input, a select, a textarea, button a, button input, button select, button textarea",
    )
    .count();
  expect(nestedInteractive).toBe(0);

  await page.goto("/annonser?q=&category=&sort=new");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
  await expect(page.getByRole("heading", { level: 1, name: "Annonser" })).toBeVisible();
  expect(
    await page
      .locator(
        "a button, a input, a select, a textarea, button a, button input, button select, button textarea",
      )
      .count(),
  ).toBe(0);
});
