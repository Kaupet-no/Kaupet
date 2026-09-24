/**
 * Shared helpers for driving the /ny-annonse wizard from e2e tests.
 * Extracted once a second spec (publish-vehicle-listing.spec.ts) started
 * duplicating the step-navigation and login logic already in
 * publish-listing.spec.ts — see E2E-ROBUSTNESS-PLAN-STATUS.md, forslag #3.
 */
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  // Permanent (not error-triggered) console/pageerror capture — a login
  // flake was observed a few times across CI runs (never reproduced or
  // root-caused beyond "click completed, page stayed on /auth"), so this
  // gives the next occurrence a chance to leave a trail in the CI job log.
  // Attached to login() rather than each spec individually so both specs
  // get it automatically.
  page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  // "/auth" (no search params) triggers a client-side redirect to
  // "/auth?mode=signin" — validateSearch's .default("signin") canonicalizes
  // the URL — which remounts the form and wipes whatever was just filled.
  // Going straight to the canonical URL avoids that race entirely (it only
  // surfaced once Turnstile's load time gave the redirect time to land
  // between fill and click).
  await page.goto("/auth?mode=signin");
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(password);
  await page.getByRole("main").getByRole("button", { name: "Logg inn" }).click();
  await expect(page).toHaveURL(/\/(?:bedrift)?(?:\?.*)?$/, { timeout: 10_000 });
}

/** type=sell is required — without it the route redirects to "/". */
export async function goToNewListing(page: Page, title?: string) {
  const suffix = title ? `&title=${encodeURIComponent(title)}` : "";
  await page.goto(`/ny-annonse?type=sell${suffix}`);
  // See goToNewWantListing: the category search box is present pre-hydration,
  // so filling it too early can be silently discarded once React hydrates.
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

export async function goToNewWantListing(page: Page, native = false) {
  await page.goto(`/ny-ok-annonse${native ? "?forcenative=1" : ""}`);
  // The "Kort beskrivelse" input is present in the pre-hydration SSR markup,
  // so a fill() right after goto() can land before React attaches its
  // listeners — the value (and the following click) is then silently lost
  // once hydration commits and re-renders from still-empty form state.
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

export function composerPage(page: Page, pageKey: string) {
  return page.getByTestId(`composer-page-${pageKey}`);
}

export function publishingStatusButton(page: Page) {
  return page.getByTestId("publishing-status-button");
}

export function missingInformationDialog(page: Page) {
  return page.getByRole("dialog", { name: "Opplysninger som mangler" });
}

export async function openPublishingStatus(page: Page) {
  await publishingStatusButton(page).click();
  await expect(missingInformationDialog(page)).toBeVisible();
}

export async function fixMissingInformation(page: Page, label: string) {
  const dialog = missingInformationDialog(page);
  await dialog
    .locator("li")
    .filter({ hasText: label })
    .getByRole("button", { name: "Fiks dette" })
    .click();
  await expect(dialog).toBeHidden();
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
 * showing the page containing the description field. The generic flow's
 * "Om tingen" page may start with category attributes, so the stable
 * textarea test id—not the page wrapper key—is the boundary used here.
 * Vehicle callers differ in how many transitions it takes to get to their
 * vehicle-facts page, so that transition remains each caller's responsibility.
 */
export async function fillDescriptionAndAdvance(
  page: Page,
  testInfo: TestInfo,
  description: string,
) {
  await page.getByTestId("listing-description-textarea").waitFor();
  await page.getByTestId("listing-description-textarea").fill(description);
  await clickNextAndWaitFor(page, wizardStep(page, "condition"), testInfo);
}

/**
 * Publishes from the flow's final page. Vehicle pages also keep
 * delivery/location on this page; generic listings arrive here from their
 * separate "Pris og henting" page.
 *
 * Publishing without having opened the preview first prompts a "want to
 * preview before publishing?" dialog rather than publishing immediately.
 * Asserts on the PublishedListingDialog's persistent title, not the
 * success toast — the toast auto-dismisses after a few seconds and was
 * the source of an intermittent CI flake (the toast could already be gone
 * by the time this assertion ran, even though publishing had succeeded).
 */
export async function publishAndExpectSuccess(page: Page, testInfo: TestInfo) {
  // Publiseringsknappen låses ikke lenger av Turnstile — tokenet ventes ut
  // inne i publiseringsmutasjonen (se review-publish/index.tsx og
  // ny-annonse.tsx). Ekstra tidsbudsjett beholdes fordi den ventingen nå
  // skjer etter klikket, og Turnstiles utfordringsiframe fortsatt kan være
  // nettverkstreg i CI.
  testInfo.setTimeout(testInfo.timeout + 20_000);
  await expect(page.getByTestId("publish-listing-button")).toBeEnabled({ timeout: 20_000 });
  await clickAndWaitFor(
    page,
    page.getByTestId("publish-listing-button"),
    page.getByTestId("publish-anyway-button"),
    testInfo,
    "no-progress-after-publish-click",
  );
  // Feilgjetting: en rask dobbeltklikk skal fortsatt starte nøyaktig én
  // publisering og ikke konkurrere om Turnstile-tokenet.
  await page.getByTestId("publish-anyway-button").dblclick();
  await page
    .getByRole("heading", { name: "Annonsen din er publisert, bra jobba!" })
    .waitFor({ timeout: 20_000 });
}

/**
 * Velger en kategori via søkefeltet på wizardens første steg.
 *
 * Søket treffer på tvers av alle nivåer, så det er ikke nødvendig å bore seg
 * nedover. Flisene har et stabilt `data-category-name` (se category-picker.tsx)
 * i stedet for tilgjengelig tekst, som i søketreff prefikses med et brødsmule-
 * spor. Å vente på at flisen løsner fra DOM-en er et direkte signal om at
 * wizarden har gått videre — steget avmonteres etter sin egen
 * SELECTION_CONFIRM_MS-forsinkelse, og den lengden skal ingen test gjette på.
 */
export async function chooseCategory(page: Page, categoryName: string) {
  const categorySearch = page.getByTestId("category-search-input");
  await categorySearch.waitFor({ timeout: 10_000 });
  await categorySearch.fill(categoryName);
  const categoryTile = page.locator(`[data-category-name="${categoryName}"]`);
  await categoryTile.click();
  await categoryTile.waitFor({ state: "detached" });
}

/**
 * Går tilbake til et tidligere steg via stegtelleren.
 *
 * Telleren ble gjort om til en meny i ui-gjennomgangen (W7/W8), samtidig som
 * oppsummeringen med «Endre»-knapper per rad ble fjernet (W9). Menyelementene
 * heter «<nummer>. <stegtittel>», så `stepLabel` matcher bare tittelen.
 */
export async function goBackToStep(page: Page, stepLabel: string) {
  await page.getByRole("button", { name: /^Steg \d+ av \d+$/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`\\d+\\. ${stepLabel}$`) }).click();
}
