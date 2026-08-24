import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const FILTER_QUERY = "e2efilterfixture";

async function waitForHydration(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

async function installDeterministicListingRoutes(page: Page) {
  await page.route("**/rest/v1/rpc/search_listings_page", async (route) => {
    const request = route.request();
    const payload = (request.postDataJSON() ?? {}) as Record<string, unknown>;

    await route.continue({
      postData: JSON.stringify({
        ...payload,
        _include_groups: [{ mode: "all", terms: [FILTER_QUERY] }],
        _exclude_any_terms: null,
        _exclude_all_groups: [],
        _category_ids: null,
        _conditions: null,
        _include_free: true,
        _min_price: null,
        _max_price: null,
        _attribute_filters: {},
        _center_lat: null,
        _center_lng: null,
        _radius_km: 10,
      }),
    });
  });

  await page.route("**/rest/v1/rpc/popular_listings_last_week", async (route) => {
    const payload = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    const response = await route.fetch({
      postData: JSON.stringify({ ...payload, _limit: 100 }),
    });
    const listings = (await response.json()) as Array<{ title?: string }>;
    const fixtureListings = listings.filter((listing) => listing.title?.startsWith(FILTER_QUERY));

    await route.fulfill({ response, body: JSON.stringify(fixtureListings) });
  });
}

test.beforeEach(async ({ page }) => {
  await installDeterministicListingRoutes(page);
});

async function openResults(page: Page, native: boolean) {
  await page.goto(`/annonser?q=${FILTER_QUERY}&sort=price_asc${native ? "&forcenative=1" : ""}`);
  await waitForHydration(page);
  await page.getByRole("link", { name: /e2efilterfixture gratis/ }).waitFor();
}

test("forsiden holder visuell kontrakt", async ({ page }, testInfo) => {
  if (!testInfo.project.name.endsWith("web")) {
    await page.addInitScript(() => {
      localStorage.setItem("kaupet_onboarding_completed_v1", "true");
    });
  }
  await page.goto(testInfo.project.name.endsWith("web") ? "/" : "/?forcenative=1");
  await waitForHydration(page);
  if (testInfo.project.name.endsWith("web")) {
    await page.locator('input[aria-label="Søk i annonser"]').last().focus();
  }
  await expect(page).toHaveScreenshot("homepage.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("det native søkepanelet holder visuell kontrakt", async ({ page }) => {
  await page.goto("/annonser?sort=price_asc&forcenative=1");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Filtrer", exact: true }).click();
  await page.getByRole("heading", { name: "Søk og filtrer" }).waitFor();
  await expect(page).toHaveScreenshot("search-panel.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("resultatflaten holder visuell kontrakt", async ({ page }, testInfo) => {
  await openResults(page, !testInfo.project.name.endsWith("web"));
  await expect(page).toHaveScreenshot("results.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("annonsedetaljen holder visuell kontrakt", async ({ page }, testInfo) => {
  await openResults(page, !testInfo.project.name.endsWith("web"));
  await page
    .getByRole("link", { name: /e2efilterfixture gratis/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/\d{8}(?:\?|$)/);
  await page.getByRole("button", { name: "Logg inn for å sende melding" }).waitFor();
  await expect(page).toHaveScreenshot("listing-detail.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("innlogging holder visuell kontrakt", async ({ page }) => {
  await page.goto("/auth?mode=signin");
  await waitForHydration(page);
  await page.getByRole("heading", { name: "Logg inn" }).waitFor();
  await expect(page).toHaveScreenshot("auth.png", {
    animations: "disabled",
    fullPage: true,
  });
});
