import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { login } from "./pages/listing-wizard";

async function waitForHydration(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

test("innlogget Proff-toppfelt har tilgjengelige kontroller uten horisontal scrolling", async ({
  page,
}) => {
  const { users } = JSON.parse(readFileSync(new URL(".auth/user.json", import.meta.url), "utf8"));
  // Proff-logoen er bredere enn privatlogoen og utløste DEF-A11Y-03.
  await login(page, users["desktop-web"].email, users["desktop-web"].password);

  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/bedriftsinvitasjon");
    await waitForHydration(page);
    const nav = page.getByRole("navigation", { name: "Hovednavigasjon" });
    await expect(nav.getByText("Proff", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const assertFitsViewport = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      for (const control of await nav.locator("a:visible, button:visible, input:visible").all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    };
    await assertFitsViewport();

    const menu = nav.getByRole("button", { name: /^Brukermeny/ });
    await menu.focus();
    await menu.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Min profil" })).toBeVisible();
    const menuBox = await page.getByRole("menu").boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();

    await nav.getByRole("button", { name: /^Varsler/ }).click();
    await expect(page.getByRole("link", { name: "Se alle varsler" })).toBeVisible();
    await assertFitsViewport();
    await page.keyboard.press("Escape");

    if (width < 768) {
      await nav.getByRole("button", { name: "Åpne søk" }).click();
      await expect(
        page
          .getByRole("dialog")
          .filter({ has: page.getByRole("heading", { name: "Søk og filtrer" }) }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await page.goto("/annonser?q=&category=&sort=new");
      await waitForHydration(page);
      await expect(
        page.getByRole("textbox", { name: "Søk i annonser", exact: true }),
      ).toBeVisible();
      await assertFitsViewport();
    }

    await nav.getByRole("link", { name: /^Meldinger/ }).click();
    await expect(page).toHaveURL(/\/meldinger/);
  }
});

// Safari on macOS uses Option-Tab for all controls with the default keyboard
// preference. Use real keyboard navigation without changing the user's OS:
// https://support.apple.com/en-gb/guide/safari/cpsh003/mac
function tabKey(browserName: string, reverse = false) {
  const modifier = browserName === "webkit" && process.platform === "darwin" ? "Alt+" : "";
  return `${modifier}${reverse ? "Shift+" : ""}Tab`;
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

test("native lokasjonsvalg kan åpnes og lukkes med tastatur uten fokusfelle", async ({
  page,
  browserName,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("kaupet_onboarding_completed_v1", "true");
  });
  await page.goto("/?forcenative=1");
  await waitForHydration(page);

  // Søket er et ekte søkefelt; lokasjon åpner det delte søkepanelet.
  const search = page.getByRole("searchbox", { name: "Søk i annonser" });
  const location = page.getByRole("button", {
    name: "Velg lokasjon: Hele Norge",
  });

  await search.focus();
  await search.press(tabKey(browserName));
  await expect(location).toBeFocused();

  await location.press("Space");
  const overlay = page.getByRole("dialog", { name: "Søk og filtrer" });
  await expect(overlay).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(overlay).not.toBeVisible();
  await expect(location).toBeFocused();
});

test("native søkepanel returnerer fokus til filterknappen etter Escape", async ({
  page,
  browserName,
}) => {
  await page.goto("/annonser?forcenative=1&q=&category=&sort=new");
  await waitForHydration(page);

  // Søkepillen (SearchSummaryPill) har et ekte søkefelt; første brikke i
  // brikkeraden under er «Filtre», som åpner hele filterlisten.
  const search = page.getByRole("searchbox", { name: "Søk i annonser" });
  const filter = page.getByRole("button", { name: "Alle filtre", exact: true });

  await search.focus();
  await search.press(tabKey(browserName));
  await expect(filter).toBeFocused();

  await filter.press("Enter");
  const panel = page.getByRole("dialog", { name: "Søk og filtrer" });
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(filter).toBeFocused();

  await filter.press(tabKey(browserName, true));
  await expect(search).toBeFocused();
});

test("innloggingens primærhandling nås og aktiveres med tastatur", async ({
  page,
  browserName,
}) => {
  await page.goto("/auth?mode=signin");
  await waitForHydration(page);

  const password = page.getByLabel("Passord", { exact: true });
  const signUp = page.getByRole("button", { name: "Bli medlem" });
  const submit = page.getByRole("button", { name: "Logg inn", exact: true });
  await expect(submit).toBeEnabled();

  await signUp.focus();
  await signUp.press(tabKey(browserName, true));
  await expect(submit).toBeFocused();

  await submit.press("Space");
  await expect(page.getByLabel("E-post")).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
});
