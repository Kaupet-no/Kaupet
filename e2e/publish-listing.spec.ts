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

  // The category grid is populated by a client-side query, so it isn't
  // there yet right after goto() resolves — wait for the first tile before
  // starting to drill down, or the loop below sees 0 tiles on its very
  // first check and exits immediately without ever clicking anything.
  await page.locator("button:has(span.leading-tight)").first().waitFor({ timeout: 10_000 });

  // Category must be chosen first — it's always the wizard's first step,
  // rendered as a drill-down grid (main category -> sub -> ... -> leaf) of
  // tiles, each an icon plus a name in a `.leading-tight` span (see
  // rowItem/grid rendering in category-picker.tsx) — that span is what
  // distinguishes a pickable tile from the wizard's other buttons ("Neste",
  // "Tilbake til kategorier", ...). Picking a leaf auto-advances to the next
  // step, at which point no tiles remain and the loop stops. Avoid "Bil og
  // MC": it's selectable at the top level despite having children (so the
  // loop would otherwise treat it as a leaf), but branches into a
  // vehicle-specific flow with different fields than this test fills in.
  for (let depth = 0; depth < 6; depth++) {
    const tiles = page
      .locator("button:has(span.leading-tight)")
      .filter({ hasNotText: "Bil og MC" });
    if ((await tiles.count()) === 0) break;
    await tiles.first().click();
    // Picker shows a checkmark confirmation for SELECTION_CONFIRM_MS before
    // firing onSelect and (for leaves) advancing to the next step.
    await page.waitForTimeout(500);
  }

  await page.getByLabel("Tittel").fill("E2E testannonse — Stokke Tripp Trapp");
  await page
    .getByLabel("Beskrivelse")
    .fill("Automatisk opprettet av en e2e-test. Stol i god stand, lite brukt.");

  await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();

  await page.getByRole("button", { name: "Publiser annonse" }).click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
});
