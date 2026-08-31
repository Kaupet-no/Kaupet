import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function waitForHydration(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

test("kritiske offentlige sider har landemerker og ingen nøstede interaksjoner", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);

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
  await waitForHydration(page);
  await expect(page.getByRole("heading", { level: 1, name: "Annonser" })).toBeVisible();
  expect(
    await page
      .locator(
        "a button, a input, a select, a textarea, button a, button input, button select, button textarea",
      )
      .count(),
  ).toBe(0);
});

test("native lokasjonsvalg kan åpnes og lukkes med tastatur uten fokusfelle", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kaupet_onboarding_completed_v1", "true");
  });
  await page.goto("/?forcenative=1");
  await waitForHydration(page);

  // Søk og lokasjon er nå egne knapper som åpner det delte søkepanelet
  // ("Søk og filtrer"), ikke et frittstående søkefelt lenger.
  const search = page.getByRole("button", { name: "Åpne søk i annonser" });
  const location = page.getByRole("button", {
    name: "Velg lokasjon: Hele Norge",
  });

  await search.focus();
  await search.press("Tab");
  await expect(location).toBeFocused();

  await location.press("Space");
  const overlay = page.getByRole("dialog", { name: "Søk og filtrer" });
  await expect(overlay).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(overlay).not.toBeVisible();
  await expect(location).toBeFocused();

  await location.press("Shift+Tab");
  await expect(search).toBeFocused();
});

test("native søkepanel returnerer fokus til filterknappen etter Escape", async ({ page }) => {
  await page.goto("/annonser?forcenative=1&q=&category=&sort=new");
  await waitForHydration(page);

  // Søket er en knapp (SearchSummaryPill) på native resultatflater, ikke et
  // frittstående søkefelt — samme mønster som landingssiden over.
  const search = page.getByRole("button", { name: "Søk i annonser" });
  const filter = page.getByRole("button", { name: "Filtrer", exact: true });

  await search.focus();
  await search.press("Tab");
  await expect(filter).toBeFocused();

  await filter.press("Enter");
  const panel = page.getByRole("dialog", { name: "Søk og filtrer" });
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(filter).toBeFocused();

  await filter.press("Shift+Tab");
  await expect(search).toBeFocused();
});

test("innloggingens primærhandling nås og aktiveres med tastatur", async ({ page }) => {
  await page.goto("/auth?mode=signin");
  await waitForHydration(page);

  const password = page.getByLabel("Passord");
  const signUp = page.getByRole("button", { name: "Bli medlem" });
  const submit = page.getByRole("button", { name: "Logg inn", exact: true });
  await expect(submit).toBeEnabled();

  await signUp.focus();
  await signUp.press("Shift+Tab");
  await expect(submit).toBeFocused();

  await submit.press("Space");
  await expect(page.getByLabel("E-post")).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
});
