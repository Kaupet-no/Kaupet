/**
 * Golden-path e2e test: log in and publish a listing.
 * Requires a running dev server and a reachable Supabase project — see
 * README.md → Testing for how to configure and run this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const { email, password } = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json"),
    "utf-8",
  ),
) as { email: string; password: string };

test("logger inn og publiserer en annonse", async ({ page }) => {
  await page.goto("/auth");
  // Inputs are controlled (SSR-rendered, then hydrated) — filling before
  // hydration finishes gets clobbered when React reconciles to its initial
  // empty state, so wait for the network to settle first.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord").fill(password);
  await expect(page.getByLabel("E-post")).toHaveValue(email);
  await page.getByRole("main").getByRole("button", { name: "Logg inn" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });

  // type=sell is required — without it the route redirects to "/" (entry
  // is meant to go through the "Opprett en annonse" picker dialog, which
  // sets this param before navigating here).
  await page.goto("/ny-annonse?type=sell");

  // Category must be chosen first — it's always the wizard's first step.
  // Search directly for a known leaf with no *required* extra attributes
  // (only an optional "Merke" text field — see the category_attribute_
  // definitions seed) rather than drilling blind: many leaves (e.g.
  // Elektronikk > TV og lyd > TV) have several required attribute selects
  // this test doesn't fill in, which blocks the wizard from advancing.
  // Search matches across every level, so no drill-down is needed.
  const categorySearch = page.getByPlaceholder("Søk i kategorier...");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill("Stellebord og oppbevaring");
  await page.getByRole("button", { name: /Stellebord og oppbevaring/ }).click();
  // Picker shows a checkmark confirmation for SELECTION_CONFIRM_MS before
  // firing onSelect and advancing to the next step.
  await page.waitForTimeout(500);

  // Tittel, Kategori (already set), Tilstand and Pris all live on the same
  // "Bilder & tittel" step. getByLabel is ambiguous here — the step
  // indicator's progressbar has an aria-label like "Steg 2 av 4: Bilder &
  // tittel", which also matches "Tittel" as a substring — so scope to the
  // textbox role instead.
  await page.getByRole("textbox", { name: "Tittel" }).fill("E2E testannonse — Stokke Tripp Trapp");
  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  // Beskrivelse, delivery/location and the publish confirmation are each
  // their own subsequent step. Walk forward generically: fill Beskrivelse
  // when its step is showing, dismiss the "no images added" confirmation
  // dialog the first "Neste" click triggers, and stop once "Publiser
  // annonse" appears.
  for (let i = 0; i < 5; i++) {
    const publishButton = page.getByRole("button", { name: "Publiser annonse" });
    if (await publishButton.isVisible().catch(() => false)) break;

    const descriptionField = page.getByRole("textbox", { name: "Beskrivelse" });
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill(
        "Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.",
      );
    }

    await page.getByRole("button", { name: /^Neste/ }).click();

    const continueWithoutImage = page.getByRole("button", { name: "Fortsett uten bilde" });
    if (await continueWithoutImage.isVisible().catch(() => false)) {
      await continueWithoutImage.click();
    }
  }

  await page.getByRole("button", { name: "Publiser annonse" }).click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
});
