/**
 * Golden-path e2e test: search from the homepage without logging in — the
 * unauthenticated flow most visitors actually take. Requires a running dev
 * server and a reachable Supabase project — see README.md → Testing.
 *
 * NOTE: written from selectors observed manually in a live browser session
 * against a local dev server during a code-review pass, but NOT executed
 * through the Playwright runner here — this sandbox has no SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY configured, so `bun run test:e2e` cannot connect
 * to a real Supabase project to run it. Run it once against a configured
 * environment before relying on it in CI.
 */
import { expect, test } from "@playwright/test";

test("søker fra forsiden og lander på annonser-siden med treff", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder(/f\.eks\./).fill("sykkel");
  await page.getByRole("button", { name: "Søk", exact: true }).click();

  await expect(page).toHaveURL(/\/annonser\?/);
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
