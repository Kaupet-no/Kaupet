/**
 * Shared helpers for driving the /ny-annonse wizard from e2e tests.
 * Extracted once a second spec (publish-vehicle-listing.spec.ts) started
 * duplicating the step-navigation and login logic already in
 * publish-listing.spec.ts — see E2E-ROBUSTNESS-PLAN-STATUS.md, forslag #3.
 */
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
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
}

/** type=sell is required — without it the route redirects to "/". */
export async function goToNewListing(page: Page) {
  await page.goto("/ny-annonse?type=sell");
}

/**
 * Clicks the wizard's "Neste" button and waits for `expected` to appear.
 * Retries the click a bounded number of times if `expected` doesn't show up
 * in time — the click has been observed (via trace inspection) to complete
 * without error yet leave the page state unchanged, which every static
 * analysis of goToNextPage()'s validation logic says shouldn't be possible.
 * Rather than block on fully root-causing that, this treats "no progress
 * after a successful click" as an observable, retriable condition. Each
 * retry attaches a screenshot to the test report for further diagnosis if
 * this still doesn't resolve it. See E2E-ROBUSTNESS-PLAN-STATUS.md, Fase 5
 * punkt 3 / "Ikke løst".
 */
export async function clickNextAndWaitFor(page: Page, expected: Locator, testInfo: TestInfo) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    await page.getByTestId("wizard-next-button").click();
    const appeared = await expected
      .waitFor({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return;
    if (i < attempts - 1) {
      await testInfo.attach(`no-progress-after-neste-click-attempt-${i + 1}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  }
  // Final attempt: let the normal timeout/error surface with Playwright's
  // own diagnostics if it still hasn't appeared.
  await expected.waitFor();
}

export function wizardStep(page: Page, groupKey: string) {
  return page.getByTestId(`wizard-step-${groupKey}`);
}

/**
 * Fills and advances past the Beskrivelse-steget, which is identical
 * between the generic and kjøretøy-flyten. Assumes the wizard is already
 * showing this step (callers differ in how many "Neste"-clicks it takes to
 * get here — the generic flow lands on it directly after the no-image
 * dialog, the vehicle flow needs an explicit prior click past
 * vehicle-condition — so that transition is intentionally each caller's own
 * responsibility, not baked in here).
 */
export async function fillDescriptionAndAdvance(
  page: Page,
  testInfo: TestInfo,
  description: string,
) {
  await wizardStep(page, "description-keywords").waitFor();
  await page.getByTestId("listing-description-textarea").fill(description);
  await clickNextAndWaitFor(page, wizardStep(page, "delivery-location"), testInfo);
}

/**
 * Final step: delivery/location + publish confirmation share one page.
 * Publishing without having opened the preview first prompts a "want to
 * preview before publishing?" dialog rather than publishing immediately.
 */
export async function publishAndExpectSuccess(page: Page) {
  await page.getByTestId("publish-listing-button").click();
  await page.getByTestId("publish-anyway-button").click();
  await expect(page.getByText("Annonsen er publisert")).toBeVisible({ timeout: 15_000 });
}
