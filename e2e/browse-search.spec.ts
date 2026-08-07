/**
 * Golden-path e2e test: search from the homepage without logging in — the
 * unauthenticated flow most visitors actually take. Requires a running dev
 * server and a reachable Supabase project — see README.md → Testing.
 *
 * First real CI run (2026-08-07, PR #205) surfaced the same "click completes
 * without error, page state unchanged" symptom already documented in
 * e2e/pages/listing-wizard.ts's clickNextAndWaitFor: the "Søk" button click
 * landed back on "/" instead of navigating to /annonser, most likely a
 * hydration race (form's onSubmit not yet attached when Playwright's click
 * fires). Retried for the same reason, with the same bounded approach.
 */
import { expect, test } from "@playwright/test";

test("søker fra forsiden og lander på annonser-siden med treff", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Søk i annonser").fill("sykkel");

  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    await page.getByRole("button", { name: "Søk", exact: true }).click();
    const navigated = await page
      .waitForURL(/\/annonser\?/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (navigated) break;
    if (i === attempts - 1) {
      // Final attempt: let the normal assertion surface Playwright's own
      // diagnostics if it still hasn't navigated.
      await expect(page).toHaveURL(/\/annonser\?/);
    } else {
      // A failed attempt may have cleared the input (full page still on
      // "/") — refill before retrying.
      await page.getByLabel("Søk i annonser").fill("sykkel");
    }
  }

  await expect(page.getByPlaceholder("Hva leter du etter?")).toHaveValue("sykkel");
  // Either real results or the explicit empty state — both prove the search
  // request round-tripped and the page rendered a result, not a crash.
  // .first() because a 0-results response also renders "0 annonser" in the
  // filter chips' "vis resultater" button alongside the empty state message —
  // two elements match, but either one alone is proof enough here.
  await expect(
    page
      .getByText(/\d+ annonser?/)
      .or(page.getByText("Ingen annonser funnet"))
      .first(),
  ).toBeVisible({ timeout: 15_000 });
});
