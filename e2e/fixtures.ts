import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  const externalFrameErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Chromium logs even handled 4xx RPC responses as console errors.
    // The response listener below still catches 4xx from every other resource.
    if (
      /^Failed to load resource: the server responded with a status of 4\d\d/.test(message.text())
    )
      return;
    // Firefox reports Turnstile's postMessage after its iframe is removed
    // during navigation. Keep this exact external-frame diagnostic as an
    // attachment; application errors and other origin mismatches still fail.
    if (
      message.text().includes("Failed to execute ‘postMessage’ on ‘DOMWindow’") &&
      message.text().includes("target origin provided (‘https://challenges.cloudflare.com’)") &&
      message.text().includes("recipient window’s origin (‘http://localhost:")
    ) {
      externalFrameErrors.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (response.status() < 500 && response.request().headers()["x-tsr-serverfn"] === "true")
      return;
    httpErrors.push(`${response.status()} ${response.url()}`);
  });

  return { consoleErrors, pageErrors, httpErrors, externalFrameErrors };
}

export const test = base.extend({
  page: async ({ page }, fixture, testInfo) => {
    const { consoleErrors, pageErrors, httpErrors, externalFrameErrors } =
      collectBrowserErrors(page);
    await fixture(page);

    if (externalFrameErrors.length > 0) {
      await testInfo.attach("turnstile-frame-teardown", {
        body: Buffer.from(externalFrameErrors.join("\n"), "utf8"),
        contentType: "text/plain",
      });
    }

    const diagnostics = [
      ...consoleErrors.map((message) => `console.error: ${message}`),
      ...pageErrors.map((message) => `pageerror: ${message}`),
      ...httpErrors.map((message) => `http: ${message}`),
    ];

    if (diagnostics.length > 0) {
      await testInfo.attach("browser-errors", {
        body: Buffer.from(diagnostics.join("\n"), "utf8"),
        contentType: "text/plain",
      });
    }

    expect(diagnostics, "Nettleseren rapporterte feil").toEqual([]);
  },
});

export type { Locator } from "@playwright/test";
export { expect };
