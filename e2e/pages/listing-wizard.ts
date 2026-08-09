/**
 * Shared helpers for driving the /ny-annonse wizard from e2e tests.
 * Extracted once a second spec (publish-vehicle-listing.spec.ts) started
 * duplicating the step-navigation and login logic already in
 * publish-listing.spec.ts — see E2E-ROBUSTNESS-PLAN-STATUS.md, forslag #3.
 */
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export async function login(page: Page, email: string, password: string, testInfo: TestInfo) {
  // Permanent (not error-triggered) console/pageerror capture — a login
  // flake was observed a few times across CI runs (never reproduced or
  // root-caused beyond "click completed, page stayed on /auth"), so this
  // gives the next occurrence a chance to leave a trail in the CI job log.
  // Attached to login() rather than each spec individually so both specs
  // get it automatically.
  page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  await page.goto("/auth");
  // Inputs are controlled (SSR-rendered, then hydrated) — filling before
  // hydration finishes gets clobbered when React reconciles to its initial
  // empty state. Used to wait for networkidle first, but the Turnstile
  // widget keeps a connection open and networkidle never fires — retry the
  // fill instead until it sticks.
  await expect(async () => {
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Passord").fill(password);
    await expect(page.getByLabel("E-post")).toHaveValue(email);
  }).toPass({ timeout: 15_000 });

  // Retried for the same reason as clickAndWaitFor's other call sites (see
  // its docstring) — but the "expected" condition here is a URL change, not
  // an element appearing, so this doesn't go through clickAndWaitFor itself.
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    await page.getByRole("main").getByRole("button", { name: "Logg inn" }).click();
    const loggedIn = await page
      .waitForURL("/", { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (loggedIn) return;
    if (i < attempts - 1) {
      await testInfo.attach(`no-progress-after-login-click-attempt-${i + 1}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  }
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

/** type=sell is required — without it the route redirects to "/". */
export async function goToNewListing(page: Page) {
  await page.goto("/ny-annonse?type=sell");
}

/**
 * Clicks `trigger` and waits for `expected` to appear. Retries the click a
 * bounded number of times if `expected` doesn't show up in time — clicks in
 * this wizard have been observed (via trace inspection) to complete without
 * error yet leave the page state unchanged, which every static analysis of
 * the underlying validation/mutation logic says shouldn't be possible.
 * Rather than block on fully root-causing that, this treats "no progress
 * after a successful click" as an observable, retriable condition. Each
 * retry attaches a screenshot to the test report for further diagnosis if
 * this still doesn't resolve it. See E2E-ROBUSTNESS-PLAN-STATUS.md, Fase 5
 * punkt 3 / "Ikke løst".
 *
 * Originally scoped to just the "Neste"-button; generalized to cover the
 * publish-button and login-button click sites, which showed the identical
 * symptom (see PR discussion on the flaky E2E run of 2026-08-07).
 *
 * Revurder denne retry-mekanismen etter 2026-11-01 eller 20 flere CI-
 * kjøringer uten at loggingen fra E2E-ROBUSTNESS-PLAN-STATUS-3.md punkt 2
 * (login-flake) eller den permanente konsoll-fangsten fra Fase B (runde 2)
 * har gitt et spor til root cause. Hvis fortsatt uforklart innen da, tell
 * det som "ikke reproduserbart i praksis" og vurder å forenkle til en enkel
 * økt timeout uten retry-logikken. Se E2E-ROBUSTNESS-PLAN-STATUS-3.md
 * punkt 4.
 */
export async function clickAndWaitFor(
  page: Page,
  trigger: Locator,
  expected: Locator,
  testInfo: TestInfo,
  attachmentLabel = "no-progress-after-click",
) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    // Some triggers (e.g. a dialog's confirm button) detach once the click
    // has actually registered and the action it kicks off is under way but
    // not yet finished — re-clicking a detached trigger just hangs waiting
    // for it to reappear, which never happens. Only click while it's still
    // there; otherwise treat "trigger already gone" as progress and fall
    // through to waiting for `expected`.
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click({ timeout: 5_000 }).catch(() => {});
    }
    const appeared = await expected
      .waitFor({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return;
    if (i < attempts - 1) {
      await testInfo.attach(`${attachmentLabel}-attempt-${i + 1}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  }
  // Final attempt: let the normal timeout/error surface with Playwright's
  // own diagnostics if it still hasn't appeared.
  await expected.waitFor();
}

export async function clickNextAndWaitFor(page: Page, expected: Locator, testInfo: TestInfo) {
  await clickAndWaitFor(
    page,
    page.getByTestId("wizard-next-button"),
    expected,
    testInfo,
    "no-progress-after-neste-click",
  );
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
 *
 * Asserts on the PublishedListingDialog's persistent title, not the
 * success toast — the toast auto-dismisses after a few seconds and was
 * the source of an intermittent CI flake (the toast could already be gone
 * by the time this assertion ran, even though publishing had succeeded).
 */
export async function publishAndExpectSuccess(page: Page, testInfo: TestInfo) {
  await clickAndWaitFor(
    page,
    page.getByTestId("publish-listing-button"),
    page.getByTestId("publish-anyway-button"),
    testInfo,
    "no-progress-after-publish-click",
  );
  await clickAndWaitFor(
    page,
    page.getByTestId("publish-anyway-button"),
    page.getByRole("heading", { name: "Annonsen din er publisert, bra jobba!" }),
    testInfo,
    "no-progress-after-publish-anyway-click",
  );
}
